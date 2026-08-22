import { describe, expect, it } from "vitest";

import { configurePage, reorderPages, togglePage } from "@/lib/actions/pages";
import { disconnect, renameBadge, revoke } from "@/lib/actions/badges";
import { savePolling, savePomodoro } from "@/lib/actions/settings";
import { MIN_POLL_MS, PAGE_SLUGS } from "@/lib/badge-constants";
import { clampPollInterval, MAX_POLL_MS, type DbClient } from "@/lib/db";

// Real ids come from gen_random_uuid(), so these are valid v4 values. A
// fixture that only looked like a UUID would pass a lenient check and hide
// that the action validates strictly.
const USER = "11111111-1111-4111-a111-111111111111";
const BADGE = "22222222-2222-4222-a222-222222222222";

interface Write {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters: [string, string][];
}

/**
 * A fake database that records what it was asked to do.
 *
 * Actions are tested against this rather than a live Postgres because what
 * matters here is the decision: which rows, which columns, and whether a bad
 * input was refused before anything was written.
 */
function fakeDb(failWith?: string) {
  const writes: Write[] = [];

  const client: DbClient = {
    from(table) {
      const record = (op: Write["op"], values?: Write["values"]) => {
        const write: Write = { table, op, values, filters: [] };
        writes.push(write);
        const builder = {
          eq(column: string, value: string) {
            write.filters.push([column, value]);
            return builder;
          },
          then(resolve: (value: { error: { message: string } | null }) => unknown) {
            return Promise.resolve(resolve({ error: failWith ? { message: failWith } : null }));
          },
        };
        return builder;
      };

      return {
        delete: () => record("delete"),
        insert: (values) => record("insert", values),
        update: (values) => record("update", values),
        upsert: (values) => record("upsert", values),
      };
    },
  };

  return { client, writes };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("togglePage", () => {
  it("turns a page on", async () => {
    const { client, writes } = fakeDb();
    const result = await togglePage(client, USER, form({ page_slug: "deploys", enabled: "true" }));

    expect(result.status).toBe("success");
    expect(writes[0]).toMatchObject({
      table: "page_configs",
      op: "upsert",
      values: { user_id: USER, page_slug: "deploys", enabled: true },
    });
  });

  it("turns a page off", async () => {
    const { client, writes } = fakeDb();
    await togglePage(client, USER, form({ page_slug: "deploys", enabled: "false" }));
    expect(writes[0].values).toMatchObject({ enabled: false });
  });

  it("refuses a slug this badge cannot draw, before writing anything", async () => {
    const { client, writes } = fakeDb();
    const result = await togglePage(client, USER, form({ page_slug: "weather", enabled: "true" }));

    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });

  it("reports a write that failed rather than claiming success", async () => {
    const { client } = fakeDb("permission denied");
    const result = await togglePage(client, USER, form({ page_slug: "deploys", enabled: "true" }));
    expect(result.status).toBe("error");
  });

  it("never puts the upstream error in front of the user", async () => {
    const { client } = fakeDb("permission denied for table page_configs");
    const result = await savePolling(client, USER, form({ poll_interval_ms: "30000" }));
    expect(result.status === "error" && result.message).not.toContain("permission denied");
  });
});

describe("reorderPages", () => {
  it("rewrites the whole order in one write", async () => {
    const { client, writes } = fakeDb();
    const result = await reorderPages(client, USER, form({ order: "deploys,next_thing" }));

    expect(result.status).toBe("success");
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual([
      { user_id: USER, page_slug: "deploys", position: 0 },
      { user_id: USER, page_slug: "next_thing", position: 1 },
    ]);
  });

  it("takes every page the device knows", async () => {
    const { client, writes } = fakeDb();
    const result = await reorderPages(client, USER, form({ order: PAGE_SLUGS.join(",") }));
    expect(result.status).toBe("success");
    expect(writes[0].values).toHaveLength(PAGE_SLUGS.length);
  });

  it("refuses an order carrying a slug the device cannot draw", async () => {
    const { client, writes } = fakeDb();
    const result = await reorderPages(client, USER, form({ order: "next_thing,weather" }));

    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });

  it("refuses an order that names the same page twice", async () => {
    const { client, writes } = fakeDb();
    const result = await reorderPages(client, USER, form({ order: "deploys,deploys" }));

    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });

  it("refuses an empty order", async () => {
    const { client, writes } = fakeDb();
    expect((await reorderPages(client, USER, form({ order: "" }))).status).toBe("error");
    expect(writes).toHaveLength(0);
  });
});

describe("configurePage", () => {
  it("stores every field but the slug", async () => {
    const { client, writes } = fakeDb();
    const result = await configurePage(
      client,
      USER,
      form({ page_slug: "next_thing", calendar_id: "work@example.com", look_ahead_hours: "12" }),
    );

    expect(result.status).toBe("success");
    expect(writes[0].values).toMatchObject({
      page_slug: "next_thing",
      settings: { calendar_id: "work@example.com", look_ahead_hours: 12 },
    });
  });

  it("turns a checkbox into a boolean the builder can read", async () => {
    const { client, writes } = fakeDb();
    await configurePage(client, USER, form({ page_slug: "next_thing", skip_all_day: "on" }));
    const values = writes[0].values as { settings: Record<string, unknown> };
    expect(values.settings.skip_all_day).toBe(true);
  });

  it("turns an empty field into null rather than an empty string", async () => {
    const { client, writes } = fakeDb();
    await configurePage(client, USER, form({ page_slug: "next_thing", calendar_id: "" }));
    const values = writes[0].values as { settings: Record<string, unknown> };
    expect(values.settings.calendar_id).toBeNull();
  });

  it("refuses an unknown page", async () => {
    const { client, writes } = fakeDb();
    expect((await configurePage(client, USER, form({ page_slug: "weather" }))).status).toBe(
      "error",
    );
    expect(writes).toHaveLength(0);
  });
});

describe("savePomodoro", () => {
  const valid = {
    work_min: "25",
    short_min: "5",
    long_min: "20",
    sessions: "4",
    leds: "true",
  };

  it("saves the four numbers and the LED choice", async () => {
    const { client, writes } = fakeDb();
    const result = await savePomodoro(client, USER, form(valid));

    expect(result.status).toBe("success");
    expect(writes[0]).toMatchObject({
      table: "pomodoro_settings",
      values: { user_id: USER, work_min: 25, short_min: 5, long_min: 20, sessions: 4, leds: true },
    });
  });

  it("says the badge picks these up on its next poll", async () => {
    const { client } = fakeDb();
    const result = await savePomodoro(client, USER, form(valid));
    expect(result.status === "success" && result.message).toContain("next poll");
  });

  it("names the field that was wrong", async () => {
    const { client } = fakeDb();
    const result = await savePomodoro(client, USER, form({ ...valid, work_min: "0" }));
    expect(result.status === "error" && result.message).toContain("pomodoro");
  });

  it("refuses a set of one, because a set of one is not a set", async () => {
    const { client, writes } = fakeDb();
    const result = await savePomodoro(client, USER, form({ ...valid, sessions: "1" }));
    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });

  it("treats an absent checkbox as off", async () => {
    const { client, writes } = fakeDb();
    const { leds: _leds, ...withoutLeds } = valid;
    await savePomodoro(client, USER, form(withoutLeds));
    expect(writes[0].values).toMatchObject({ leds: false });
  });
});

describe("savePolling", () => {
  it("saves an interval inside the bounds", async () => {
    const { client, writes } = fakeDb();
    const result = await savePolling(client, USER, form({ poll_interval_ms: "60000" }));

    expect(result.status).toBe("success");
    expect(writes[0]).toMatchObject({
      table: "profiles",
      op: "update",
      values: { poll_interval_ms: 60000 },
      filters: [["id", USER]],
    });
  });

  it("refuses an interval below the floor", async () => {
    const { client, writes } = fakeDb();
    const result = await savePolling(client, USER, form({ poll_interval_ms: "1000" }));
    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });

  it("says what the bounds are", async () => {
    const { client } = fakeDb();
    const result = await savePolling(client, USER, form({ poll_interval_ms: "1" }));
    expect(result.status === "error" && result.message).toContain("5 seconds");
  });
});

describe("clampPollInterval", () => {
  it("holds both bounds", () => {
    expect(clampPollInterval(1)).toBe(MIN_POLL_MS);
    expect(clampPollInterval(9_999_999)).toBe(MAX_POLL_MS);
    expect(clampPollInterval(30_000)).toBe(30_000);
  });

  it("falls back rather than writing a NaN", () => {
    expect(clampPollInterval(Number.NaN)).toBe(MIN_POLL_MS);
  });
});

describe("renameBadge", () => {
  it("scopes the update to the caller's own badge", async () => {
    const { client, writes } = fakeDb();
    const result = await renameBadge(client, USER, form({ badge_id: BADGE, label: "Desk badge" }));

    expect(result.status).toBe("success");
    expect(writes[0]).toMatchObject({
      table: "badges",
      op: "update",
      values: { label: "Desk badge" },
    });
    expect(writes[0].filters).toEqual([
      ["id", BADGE],
      ["user_id", USER],
    ]);
  });

  it("refuses an empty name", async () => {
    const { client, writes } = fakeDb();
    expect((await renameBadge(client, USER, form({ badge_id: BADGE, label: " " }))).status).toBe(
      "error",
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses a badge id that is not an id", async () => {
    const { client, writes } = fakeDb();
    const result = await renameBadge(client, USER, form({ badge_id: "'; drop", label: "x" }));
    expect(result.status).toBe("error");
    expect(writes).toHaveLength(0);
  });
});

describe("revoke", () => {
  it("writes revoked_at and nothing else, scoped to the caller", async () => {
    const { client, writes } = fakeDb();
    const result = await revoke(client, USER, form({ badge_id: BADGE }));

    expect(result.status).toBe("success");
    expect(Object.keys(writes[0].values as object)).toEqual(["revoked_at"]);
    expect(writes[0].filters).toEqual([
      ["id", BADGE],
      ["user_id", USER],
    ]);
  });

  it("says the badge will ask to pair again", async () => {
    const { client } = fakeDb();
    const result = await revoke(client, USER, form({ badge_id: BADGE }));
    expect(result.status === "success" && result.message).toContain("pair again");
  });
});

describe("disconnect", () => {
  it("deletes the row, scoped to the caller", async () => {
    const { client, writes } = fakeDb();
    const result = await disconnect(client, USER, form({ provider: "posthog" }));

    expect(result.status).toBe("success");
    expect(writes[0]).toMatchObject({ table: "connections", op: "delete" });
    expect(writes[0].filters).toEqual([
      ["user_id", USER],
      ["provider", "posthog"],
    ]);
  });

  it("refuses a provider slug that could escape a path", async () => {
    const { client, writes } = fakeDb();
    expect((await disconnect(client, USER, form({ provider: "../admin" }))).status).toBe("error");
    expect(writes).toHaveLength(0);
  });
});
