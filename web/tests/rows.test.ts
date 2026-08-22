import { describe, expect, it } from "vitest";

import {
  badgeRowSchema,
  connectionRowSchema,
  pageConfigRowSchema,
  parseRow,
  parseRows,
  providerRowSchema,
} from "@/lib/rows";

const badge = {
  id: "b1",
  badge_uid: "e6614103",
  label: "Desk badge",
  fw: "2.0.2",
  sdk: "1.0.0",
  last_seen_at: "2026-08-22T09:42:00Z",
  battery_v: "4.11",
  charging: true,
  created_at: "2026-08-01T00:00:00Z",
  revoked_at: null,
};

describe("parseRows", () => {
  it("drops one malformed row rather than hiding every other row", () => {
    const rows = parseRows(badgeRowSchema, [badge, { id: "b2" }, { ...badge, id: "b3" }]);
    expect(rows.map((row) => row.id)).toEqual(["b1", "b3"]);
  });

  it("answers an empty list when the query returned something that is not a list", () => {
    expect(parseRows(badgeRowSchema, null)).toEqual([]);
    expect(parseRows(badgeRowSchema, { id: "b1" })).toEqual([]);
  });

  it("keeps a row that carries a column this build does not know about", () => {
    const rows = parseRows(badgeRowSchema, [{ ...badge, some_future_column: 1 }]);
    expect(rows).toHaveLength(1);
  });
});

describe("badgeRowSchema", () => {
  it("coerces the numeric battery voltage Postgres sends as a string", () => {
    const row = parseRow(badgeRowSchema, badge);
    expect(row?.battery_v).toBe(4.11);
  });

  it("accepts a badge that has never reported", () => {
    const row = parseRow(badgeRowSchema, {
      ...badge,
      fw: null,
      sdk: null,
      last_seen_at: null,
      battery_v: null,
      charging: null,
    });
    expect(row?.last_seen_at).toBeNull();
  });
});

describe("providerRowSchema", () => {
  const provider = {
    slug: "vercel",
    display_name: "Vercel",
    description: "Deployment state for your projects.",
    kind: "api_key",
    scopes: [],
    docs_url: null,
    enabled: true,
    position: 50,
  };

  it("keeps both credential kinds", () => {
    expect(parseRow(providerRowSchema, provider)?.kind).toBe("api_key");
    expect(parseRow(providerRowSchema, { ...provider, kind: "oauth" })?.kind).toBe("oauth");
  });

  it("refuses a kind the code has no path for", () => {
    expect(parseRow(providerRowSchema, { ...provider, kind: "saml" })).toBeNull();
  });

  it("renders an unseeded row rather than blanking the page", () => {
    const row = parseRow(providerRowSchema, { ...provider, description: null, position: null });
    expect(row?.description).toBe("");
    expect(row?.position).toBe(0);
  });
});

describe("connectionRowSchema", () => {
  it("carries the reason a provider went bad", () => {
    const row = parseRow(connectionRowSchema, {
      id: "c1",
      provider: "posthog",
      external_account: null,
      scopes: [],
      status: "error",
      error_message: "PostHog rejected the key",
      meta: { host: "us.posthog.com" },
      expires_at: null,
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(row?.status).toBe("error");
    expect(row?.meta.host).toBe("us.posthog.com");
  });
});

describe("pageConfigRowSchema", () => {
  it("refuses a slug the device has no page for", () => {
    expect(
      parseRow(pageConfigRowSchema, {
        id: "p1",
        page_slug: "weather",
        enabled: true,
        position: 0,
        settings: {},
      }),
    ).toBeNull();
  });

  it("treats a row written before position existed as unordered", () => {
    const row = parseRow(pageConfigRowSchema, {
      id: "p1",
      page_slug: "next_thing",
      enabled: true,
      position: null,
      settings: null,
    });
    expect(row?.position).toBe(0);
    expect(row?.settings).toEqual({});
  });
});
