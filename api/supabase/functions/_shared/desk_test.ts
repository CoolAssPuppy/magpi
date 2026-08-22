import { assert, assertEquals, assertRejects } from "@std/assert";

import { DEFAULT_POLL_MS, MIN_POLL_MS } from "./badge-constants.ts";
import {
  authenticateBadge,
  buildDesk,
  hashToken,
  readDeviceReport,
  recordCheckIn,
} from "./desk.ts";
import { ApiError } from "./errors.ts";
import {
  requestsFor,
  stubDb,
  type StubDb,
  type StubReply,
  type StubRequest,
} from "./testing/stub_db.ts";

const USER = "11111111-1111-4111-a111-111111111111";
const BADGE = "22222222-2222-4222-a222-222222222222";

async function withStub(
  reply: (request: StubRequest) => StubReply | undefined,
  body: (stub: StubDb) => Promise<void>,
): Promise<void> {
  const stub = stubDb(reply);
  try {
    await body(stub);
  } finally {
    await stub.close();
  }
}

/** A fetch that fails loudly. No test here should reach a provider. */
const noFetch: typeof fetch = () => {
  throw new Error("a test reached the network");
};

Deno.test("hashToken produces the hex form PostgREST accepts for bytea", async () => {
  const hash = await hashToken("badge-token");

  assert(hash.startsWith("\\x"), hash);
  assertEquals(hash.length, 2 + 64);
  assert(/^\\x[0-9a-f]{64}$/.test(hash), hash);
});

Deno.test("hashToken is stable, so the same badge finds its own row", async () => {
  assertEquals(await hashToken("badge-token"), await hashToken("badge-token"));
});

Deno.test("hashToken never contains the token it was given", async () => {
  const hash = await hashToken("badge-token");
  assert(!hash.includes("badge-token"), "the stored value must not carry the token");
});

Deno.test("authenticateBadge looks a badge up by hash, never by the token", async () => {
  await withStub(
    () => ({ body: [{ id: BADGE, user_id: USER, revoked_at: null }] }),
    async (stub) => {
      const badge = await authenticateBadge(stub.db, "badge-token");
      assertEquals(badge, { id: BADGE, userId: USER });

      const [request] = requestsFor(stub, "badges");
      assert(request);
      assert(!request.query.includes("badge-token"), "the token was sent to the database");
      assert(request.query.includes("token_hash=eq."), request.query);
    },
  );
});

Deno.test("authenticateBadge refuses a revoked badge", async () => {
  await withStub(
    () => ({ body: [{ id: BADGE, user_id: USER, revoked_at: new Date().toISOString() }] }),
    async (stub) => {
      const error = await assertRejects(() => authenticateBadge(stub.db, "badge-token"), ApiError);
      assertEquals(error.status, 401);
    },
  );
});

Deno.test("a revoked badge and an unknown token get the same answer", async () => {
  // Telling them apart would say whether a token was ever real.
  const answers: string[] = [];

  for (const body of [[{ id: BADGE, user_id: USER, revoked_at: new Date().toISOString() }], []]) {
    await withStub(
      () => ({ body }),
      async (stub) => {
        const error = await assertRejects(
          () => authenticateBadge(stub.db, "badge-token"),
          ApiError,
        );
        answers.push(`${error.status} ${error.message}`);
      },
    );
  }

  assertEquals(answers[0], answers[1]);
});

Deno.test(
  "authenticateBadge reports a lookup failure as a server error, not as unpaired",
  async () => {
    await withStub(
      () => ({ body: { message: "boom" }, status: 500 }),
      async (stub) => {
        const error = await assertRejects(
          () => authenticateBadge(stub.db, "badge-token"),
          ApiError,
        );
        assertEquals(error.status, 500);
      },
    );
  },
);

Deno.test("readDeviceReport reads what the SDK already sends", () => {
  const report = readDeviceReport(
    new URL("http://x/desk?uid=e6614103&fw=1.2.3&sdk=1.0.0&battery_v=4.05&charging=1"),
  );

  assertEquals(report, {
    uid: "e6614103",
    fw: "1.2.3",
    sdk: "1.0.0",
    batteryV: 4.05,
    charging: true,
  });
});

Deno.test("readDeviceReport accepts the short names an older SDK sends", () => {
  const report = readDeviceReport(new URL("http://x/desk?v=3.9&chg=true"));

  assertEquals(report.batteryV, 3.9);
  assertEquals(report.charging, true);
});

Deno.test("readDeviceReport reports nothing for a field the badge did not send", () => {
  const report = readDeviceReport(new URL("http://x/desk"));

  assertEquals(report, { uid: null, fw: null, sdk: null, batteryV: null, charging: null });
});

Deno.test("readDeviceReport refuses a battery reading that is not a number", () => {
  assertEquals(readDeviceReport(new URL("http://x/desk?battery_v=full")).batteryV, null);
  assertEquals(readDeviceReport(new URL("http://x/desk?battery_v=")).batteryV, null);
});

Deno.test("readDeviceReport treats anything but 1 or true as not charging", () => {
  assertEquals(readDeviceReport(new URL("http://x/desk?charging=0")).charging, false);
  assertEquals(readDeviceReport(new URL("http://x/desk?charging=no")).charging, false);
});

Deno.test("recordCheckIn always stamps the time and writes only what was reported", async () => {
  await withStub(
    () => ({}),
    async (stub) => {
      await recordCheckIn(stub.db, BADGE, {
        uid: "e6614103",
        fw: "1.2.3",
        sdk: null,
        batteryV: null,
        charging: null,
      });

      const [request] = requestsFor(stub, "badges");
      assert(request);
      const patch = request.body;
      assert(patch && typeof patch === "object" && !Array.isArray(patch));

      const row = patch as Record<string, unknown>;
      assertEquals(Object.keys(row).sort(), ["fw", "last_seen_at"]);
      assert(request.query.includes(`id=eq.${BADGE}`), request.query);
    },
  );
});

Deno.test("recordCheckIn writes a battery reading of zero rather than dropping it", async () => {
  await withStub(
    () => ({}),
    async (stub) => {
      await recordCheckIn(stub.db, BADGE, {
        uid: null,
        fw: null,
        sdk: null,
        batteryV: 0,
        charging: false,
      });

      const [request] = requestsFor(stub, "badges");
      assert(request);
      const row = request.body as Record<string, unknown>;
      assertEquals(row.battery_v, 0);
      assertEquals(row.charging, false);
    },
  );
});

/** Answers each table buildDesk reads. Anything unnamed comes back empty. */
function deskTables(tables: Record<string, unknown[]>) {
  return ({ table, method }: StubRequest): StubReply => {
    if (method !== "GET") return {};
    return { body: tables[table] ?? [] };
  };
}

Deno.test("buildDesk answers with the pages the wearer turned on, in their order", async () => {
  await withStub(
    deskTables({
      page_configs: [
        { page_slug: "deploys", enabled: true, position: 1, settings: {} },
        { page_slug: "counters", enabled: true, position: 2, settings: {} },
      ],
    }),
    async (stub) => {
      const envelope = await buildDesk({
        db: stub.db,
        badge: { id: BADGE, userId: USER },
        fetch: noFetch,
        now: new Date("2026-08-22T09:00:00Z"),
        timeZone: "UTC",
      });

      assertEquals(
        envelope.pages.map((page) => page.slug),
        ["deploys", "counters"],
      );
    },
  );
});

Deno.test("buildDesk drops a page slug this badge cannot draw", async () => {
  await withStub(
    deskTables({
      page_configs: [
        { page_slug: "weather", enabled: true, position: 1, settings: {} },
        { page_slug: "deploys", enabled: true, position: 2, settings: {} },
      ],
    }),
    async (stub) => {
      const envelope = await buildDesk({
        db: stub.db,
        badge: { id: BADGE, userId: USER },
        fetch: noFetch,
        now: new Date(),
        timeZone: "UTC",
      });

      assertEquals(
        envelope.pages.map((page) => page.slug),
        ["deploys"],
      );
    },
  );
});

Deno.test("buildDesk asks only for the pages the wearer enabled", async () => {
  await withStub(deskTables({}), async (stub) => {
    await buildDesk({
      db: stub.db,
      badge: { id: BADGE, userId: USER },
      fetch: noFetch,
      now: new Date(),
      timeZone: "UTC",
    });

    const [request] = requestsFor(stub, "page_configs");
    assert(request);
    assert(request.query.includes(`user_id=eq.${USER}`), request.query);
    assert(request.query.includes("enabled=eq.true"), request.query);
  });
});

Deno.test(
  "a page whose provider is not connected says so, and the others still build",
  async () => {
    await withStub(
      deskTables({
        page_configs: [
          { page_slug: "deploys", enabled: true, position: 1, settings: {} },
          { page_slug: "one_number", enabled: true, position: 2, settings: {} },
        ],
        connections: [],
      }),
      async (stub) => {
        const envelope = await buildDesk({
          db: stub.db,
          badge: { id: BADGE, userId: USER },
          fetch: noFetch,
          now: new Date(),
          timeZone: "UTC",
        });

        assertEquals(envelope.pages.length, 2);
        for (const page of envelope.pages) {
          assertEquals(page.state, "not_connected");
        }
      },
    );
  },
);

Deno.test(
  "buildDesk carries the pomodoro defaults for an account that never opened settings",
  async () => {
    await withStub(deskTables({}), async (stub) => {
      const envelope = await buildDesk({
        db: stub.db,
        badge: { id: BADGE, userId: USER },
        fetch: noFetch,
        now: new Date(),
        timeZone: "UTC",
      });

      assertEquals(envelope.pomodoro.work_min, 25);
      assertEquals(envelope.pomodoro.sessions, 4);
    });
  },
);

Deno.test("buildDesk carries the wearer's own pomodoro settings when they have some", async () => {
  await withStub(
    deskTables({
      pomodoro_settings: [{ work_min: 50, short_min: 10, long_min: 30, sessions: 2, leds: false }],
    }),
    async (stub) => {
      const envelope = await buildDesk({
        db: stub.db,
        badge: { id: BADGE, userId: USER },
        fetch: noFetch,
        now: new Date(),
        timeZone: "UTC",
      });

      assertEquals(envelope.pomodoro.work_min, 50);
      assertEquals(envelope.pomodoro.leds, false);
    },
  );
});

Deno.test(
  "buildDesk falls back to the default poll interval when no profile row says otherwise",
  async () => {
    await withStub(deskTables({}), async (stub) => {
      const envelope = await buildDesk({
        db: stub.db,
        badge: { id: BADGE, userId: USER },
        fetch: noFetch,
        now: new Date(),
        timeZone: "UTC",
      });

      assertEquals(envelope.poll_interval_ms, DEFAULT_POLL_MS);
    });
  },
);

Deno.test("buildDesk refuses a poll interval below the floor, whatever the row says", async () => {
  await withStub(deskTables({ profiles: [{ poll_interval_ms: 1000 }] }), async (stub) => {
    const envelope = await buildDesk({
      db: stub.db,
      badge: { id: BADGE, userId: USER },
      fetch: noFetch,
      now: new Date(),
      timeZone: "UTC",
    });

    assertEquals(envelope.poll_interval_ms, MIN_POLL_MS);
  });
});
