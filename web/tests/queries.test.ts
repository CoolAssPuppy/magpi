import { describe, expect, it, vi } from "vitest";

import { PAGE_SLUGS } from "@/lib/badge-constants";
import {
  getPollIntervalMs,
  getPomodoroSettings,
  getProvider,
  listBadges,
  listConnections,
  listPageConfigs,
  listProviders,
} from "@/lib/queries";
import {
  badgeRowSchema,
  connectionRowSchema,
  pageConfigRowSchema,
  pomodoroSettingsRowSchema,
  providerRowSchema,
  type BadgeRow,
  type ConnectionRow,
  type PageConfigRow,
  type PomodoroSettingsRow,
  type ProviderRow,
} from "@/lib/rows";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface QueryCall {
  table: string;
  columns: string;
  filters: [string, string, unknown][];
  order: [string, boolean][];
  single: boolean;
}

interface FakeBuilder extends PromiseLike<QueryResult> {
  select(columns: string): FakeBuilder;
  is(column: string, value: null): FakeBuilder;
  eq(column: string, value: unknown): FakeBuilder;
  order(column: string, options: { ascending: boolean }): FakeBuilder;
  maybeSingle(): Promise<QueryResult>;
}

/**
 * What the database is holding for this test, and what it was asked for.
 *
 * Hoisted because the module mock below is hoisted above the imports, and the
 * queries reach for their client at call time rather than taking one.
 */
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  failure: null as string | null,
  calls: [] as QueryCall[],
}));

// `server-only` throws the moment it is imported outside a server component,
// which is the whole of what it does. Emptying it lets the queries themselves
// be read.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string): FakeBuilder {
      const call: QueryCall = { table, columns: "", filters: [], order: [], single: false };
      db.calls.push(call);

      const settle = (): QueryResult =>
        db.failure
          ? { data: null, error: { message: db.failure } }
          : { data: db.tables[table] ?? null, error: null };

      // A thenable rather than a promise, so the builder keeps taking filters
      // until something awaits it. That is how PostgREST's own builder
      // behaves, and a fake that resolved eagerly would let a dropped filter
      // pass here and fail in production.
      const builder: FakeBuilder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        is(column, value) {
          call.filters.push(["is", column, value]);
          return builder;
        },
        eq(column, value) {
          call.filters.push(["eq", column, value]);
          return builder;
        },
        order(column, options) {
          call.order.push([column, options.ascending]);
          return builder;
        },
        maybeSingle() {
          call.single = true;
          return Promise.resolve(settle());
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
          return Promise.resolve(settle()).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  }),
}));

/** Point the fake database at a set of rows, and forget the previous test. */
function given(tables: Record<string, unknown>): void {
  db.tables = tables;
  db.failure = null;
  db.calls = [];
}

/** Every read fails, the way a revoked session or a dropped connection reads. */
function givenAReadThatFails(message = "permission denied for table"): void {
  db.tables = {};
  db.failure = message;
  db.calls = [];
}

function queryFor(table: string): QueryCall {
  const call = db.calls.find((made) => made.table === table);
  if (!call) throw new Error(`nothing read ${table}; read ${db.calls.map((c) => c.table)}`);
  return call;
}

function badge(overrides: Partial<BadgeRow> = {}): BadgeRow {
  return badgeRowSchema.parse({
    id: "33333333-3333-4333-a333-333333333333",
    badge_uid: "e8:9f:6d:00:00:01",
    label: "Desk badge",
    fw: "1.4.0",
    sdk: "1.23.0",
    last_seen_at: "2026-05-01T09:41:00Z",
    battery_v: 3.9,
    charging: false,
    created_at: "2026-04-01T09:00:00Z",
    revoked_at: null,
    ...overrides,
  });
}

function provider(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return providerRowSchema.parse({
    slug: "posthog",
    display_name: "PostHog",
    description: "Puts one number on the badge.",
    kind: "api_key",
    scopes: ["read"],
    docs_url: "https://posthog.com/docs",
    enabled: true,
    position: 0,
    ...overrides,
  });
}

function connection(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return connectionRowSchema.parse({
    id: "44444444-4444-4444-a444-444444444444",
    provider: "posthog",
    external_account: "magpi",
    scopes: ["read"],
    status: "active",
    error_message: null,
    meta: {},
    expires_at: null,
    created_at: "2026-04-02T09:00:00Z",
    ...overrides,
  });
}

function pageConfig(overrides: Partial<PageConfigRow> = {}): PageConfigRow {
  return pageConfigRowSchema.parse({
    id: "55555555-5555-4555-a555-555555555555",
    page_slug: "deploys",
    enabled: true,
    position: 0,
    settings: {},
    ...overrides,
  });
}

function pomodoro(overrides: Partial<PomodoroSettingsRow> = {}): PomodoroSettingsRow {
  return pomodoroSettingsRowSchema.parse({
    work_min: 50,
    short_min: 10,
    long_min: 30,
    sessions: 3,
    leds: false,
    ...overrides,
  });
}

describe("listBadges", () => {
  it("returns the badges paired to this account", async () => {
    given({ badges: [badge({ label: "Desk badge" }), badge({ label: "Bag badge" })] });
    const badges = await listBadges();
    expect(badges.map((row) => row.label)).toEqual(["Desk badge", "Bag badge"]);
  });

  it("never asks for a badge the wearer already revoked", async () => {
    given({ badges: [badge()] });
    await listBadges();
    expect(queryFor("badges").filters).toContainEqual(["is", "revoked_at", null]);
  });

  it("puts the badge paired first at the top", async () => {
    given({ badges: [badge()] });
    await listBadges();
    expect(queryFor("badges").order).toEqual([["created_at", true]]);
  });

  it("drops a row it cannot make sense of rather than hiding the rest", async () => {
    given({ badges: [{ id: "nonsense" }, badge({ label: "Desk badge" })] });
    const badges = await listBadges();
    expect(badges.map((row) => row.label)).toEqual(["Desk badge"]);
  });

  it("shows an empty list rather than an error page when the read fails", async () => {
    givenAReadThatFails();
    expect(await listBadges()).toEqual([]);
  });
});

describe("listProviders", () => {
  it("returns the providers on offer", async () => {
    given({ providers: [provider({ slug: "posthog" }), provider({ slug: "google" })] });
    const providers = await listProviders();
    expect(providers.map((row) => row.slug)).toEqual(["posthog", "google"]);
  });

  it("leaves out a provider that is not open yet", async () => {
    given({ providers: [provider()] });
    await listProviders();
    expect(queryFor("providers").filters).toContainEqual(["eq", "enabled", true]);
  });

  it("keeps the order the catalogue was arranged in", async () => {
    given({ providers: [provider()] });
    await listProviders();
    expect(queryFor("providers").order).toEqual([["position", true]]);
  });

  it("shows nothing on offer rather than failing when the read fails", async () => {
    givenAReadThatFails();
    expect(await listProviders()).toEqual([]);
  });
});

describe("getProvider", () => {
  it("returns the one provider asked for", async () => {
    given({ providers: provider({ slug: "posthog", display_name: "PostHog" }) });
    const found = await getProvider("posthog");
    expect(found?.display_name).toBe("PostHog");
  });

  it("looks the provider up by slug, and only while it is open", async () => {
    given({ providers: provider() });
    await getProvider("posthog");
    expect(queryFor("providers").filters).toEqual([
      ["eq", "slug", "posthog"],
      ["eq", "enabled", true],
    ]);
  });

  it("returns nothing for a slug no provider answers to", async () => {
    given({ providers: null });
    expect(await getProvider("weather")).toBeNull();
  });

  it("returns nothing rather than half a provider when the row is malformed", async () => {
    given({ providers: { slug: "posthog" } });
    expect(await getProvider("posthog")).toBeNull();
  });

  it("returns nothing when the read fails", async () => {
    givenAReadThatFails();
    expect(await getProvider("posthog")).toBeNull();
  });
});

describe("listConnections", () => {
  it("returns the accounts this wearer has connected", async () => {
    given({ connections_public: [connection({ provider: "posthog" })] });
    const connections = await listConnections();
    expect(connections.map((row) => row.provider)).toEqual(["posthog"]);
  });

  it("reads the view, so no secret column can reach a page", async () => {
    given({ connections_public: [connection()] });
    await listConnections();
    const read = queryFor("connections_public");
    expect(read.columns).not.toMatch(/token|secret|refresh/);
  });

  it("shows no connections rather than failing when the read fails", async () => {
    givenAReadThatFails();
    expect(await listConnections()).toEqual([]);
  });
});

describe("listPageConfigs", () => {
  it("returns every page the device knows, saved or not", async () => {
    given({ page_configs: [pageConfig({ page_slug: "deploys" })] });
    const configs = await listPageConfigs();
    expect(configs.map((row) => row.page_slug).sort()).toEqual([...PAGE_SLUGS].sort());
  });

  it("keeps the saved pages in the order the wearer dragged them into", async () => {
    given({
      page_configs: [
        pageConfig({ page_slug: "deploys", position: 0 }),
        pageConfig({ page_slug: "counters", position: 1 }),
      ],
    });
    const configs = await listPageConfigs();
    expect(configs.slice(0, 2).map((row) => row.page_slug)).toEqual(["deploys", "counters"]);
    expect(queryFor("page_configs").order).toEqual([["position", true]]);
  });

  it("shows a page nobody has opened yet as off, at the end of the list", async () => {
    given({ page_configs: [pageConfig({ page_slug: "deploys", enabled: true })] });
    const configs = await listPageConfigs();
    const counters = configs.find((row) => row.page_slug === "counters");

    expect(counters?.enabled).toBe(false);
    expect(counters?.settings).toEqual({});
    expect(counters?.position).toBeGreaterThan(0);
  });

  it("numbers the unopened pages after the saved ones, so none collide", async () => {
    given({ page_configs: [pageConfig({ page_slug: "deploys" })] });
    const configs = await listPageConfigs();
    const positions = configs.map((row) => row.position);
    expect(new Set(positions).size).toBe(PAGE_SLUGS.length);
  });

  it("shows all five, every one off, for an account that has saved nothing", async () => {
    given({ page_configs: [] });
    const configs = await listPageConfigs();
    expect(configs).toHaveLength(PAGE_SLUGS.length);
    expect(configs.every((row) => !row.enabled)).toBe(true);
  });

  it("still lists every page when the read fails", async () => {
    givenAReadThatFails();
    const configs = await listPageConfigs();
    expect(configs.map((row) => row.page_slug)).toEqual([...PAGE_SLUGS]);
  });
});

describe("getPomodoroSettings", () => {
  it("returns what the wearer saved", async () => {
    given({ pomodoro_settings: pomodoro({ work_min: 50, leds: false }) });
    expect(await getPomodoroSettings()).toMatchObject({ work_min: 50, leds: false });
  });

  it("returns the timings the badge itself carries when nothing was saved", async () => {
    given({ pomodoro_settings: null });
    expect(await getPomodoroSettings()).toEqual({
      work_min: 25,
      short_min: 5,
      long_min: 20,
      sessions: 4,
      leds: true,
    });
  });

  it("falls back rather than showing half a row it cannot read", async () => {
    given({ pomodoro_settings: { work_min: "twenty five" } });
    expect(await getPomodoroSettings()).toMatchObject({ work_min: 25 });
  });

  it("falls back to the device timings when the read fails", async () => {
    givenAReadThatFails();
    expect(await getPomodoroSettings()).toMatchObject({ sessions: 4 });
  });
});

describe("getPollIntervalMs", () => {
  it("returns the interval this account chose", async () => {
    given({ profiles: { poll_interval_ms: 60000 } });
    expect(await getPollIntervalMs()).toBe(60000);
  });

  it("returns thirty seconds for an account that never chose one", async () => {
    given({ profiles: null });
    expect(await getPollIntervalMs()).toBe(30000);
  });

  it("returns thirty seconds when the read fails", async () => {
    givenAReadThatFails();
    expect(await getPollIntervalMs()).toBe(30000);
  });

  it("reads at most one profile", async () => {
    given({ profiles: { poll_interval_ms: 45000 } });
    await getPollIntervalMs();
    expect(queryFor("profiles").single).toBe(true);
  });
});
