import { assert, assertEquals } from "@std/assert";

import { PAGE_SLUGS } from "../badge-constants.ts";
import type { PagePayload } from "../envelope.ts";

import { buildPage, get, KNOWN_SLUGS } from "./mod.ts";
import {
  assertNoCredential,
  connectionRow,
  contextFor,
  type ContextOverrides,
  noFetch,
  type Reply,
  stubFetch,
} from "./support_test.ts";

const PROVIDERS = ["google", "vercel", "linear", "slack", "github", "notion", "posthog"];

const HEALTHY: Record<string, Reply> = {
  "format=metadata": {
    body: { payload: { headers: [{ name: "Subject", value: "deploy failed" }] } },
  },
  "gmail.googleapis.com": { body: { resultSizeEstimate: 5, messages: [{ id: "m1" }] } },
  "calendar/v3": {
    body: {
      items: [
        {
          summary: "standup",
          start: { dateTime: "2026-01-15T09:30:00Z" },
          end: { dateTime: "2026-01-15T09:45:00Z" },
        },
      ],
    },
  },
  "api.vercel.com": {
    body: {
      deployments: [{ name: "web", state: "READY", created: Date.parse("2026-01-15T08:59:00Z") }],
    },
  },
  "api.linear.app": {
    body: { data: { viewer: { assignedIssues: { nodes: [{ title: "fix login" }] } } } },
  },
  "slack.com/api/auth.test": { body: { ok: true, user_id: "U123" } },
  "slack.com/api/search.messages": { body: { ok: true, messages: { total: 1, matches: [] } } },
  "api.github.com": { body: { total_count: 3, items: [] } },
  "api.notion.com": { body: { results: [] } },
  "posthog.com": { body: { name: "signups", result: [{ data: [1, 2, 3] }] } },
};

const POSTHOG_META = { host: "us.posthog.com", project_id: "64213", insight_id: "aX9k2Lp" };

async function everyConnection() {
  return await Promise.all(
    PROVIDERS.map((provider) =>
      connectionRow({ provider, meta: provider === "posthog" ? POSTHOG_META : null }),
    ),
  );
}

/** Every enabled page, built the way the desk endpoint builds them: in parallel. */
async function buildAll(overrides: ContextOverrides): Promise<PagePayload[]> {
  const context = contextFor(overrides);
  const built = await Promise.all(KNOWN_SLUGS.map((slug) => buildPage(slug, context)));
  return built.filter((page): page is PagePayload => page !== null);
}

Deno.test("buildPage has nothing to say about a slug the device never asked for", async () => {
  assertEquals(await buildPage("weather", contextFor({ fetch: noFetch })), null);
  assertEquals(get("weather"), undefined);
});

Deno.test("every slug the device knows has a builder behind it", () => {
  assertEquals(KNOWN_SLUGS, PAGE_SLUGS);
  for (const slug of KNOWN_SLUGS) assertEquals(get(slug)?.slug, slug);
});

Deno.test("buildPage draws not_connected before it calls a builder that cannot work", async () => {
  // noFetch: a page whose provider is missing must not reach upstream at all.
  const page = await buildPage("deploys", contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug: "deploys", state: "not_connected" });
});

Deno.test("buildPage lets a page with no required provider decide for itself", async () => {
  const page = await buildPage(
    "counters",
    contextFor({ rows: [], connected: new Set(["linear"]), fetch: noFetch }),
  );
  // The builder ran and found nothing to count, rather than being skipped.
  assertEquals(page, { slug: "counters", state: "empty" });
});

Deno.test("a builder that throws becomes that page's error state", async () => {
  const stub = stubFetch({ "calendar/v3": { status: 401 } });
  const page = await buildPage(
    "next_thing",
    contextFor({ rows: [await connectionRow({ provider: "google" })], fetch: stub.fetch }),
  );

  assertEquals(page?.slug, "next_thing");
  assertEquals(page?.state, "error");
  assertEquals(page?.message, "reconnect google on the connections page");
});

Deno.test("one failing page never keeps the others from being built", async () => {
  const stub = stubFetch({ ...HEALTHY, "calendar/v3": { status: 500 } });
  const pages = await buildAll({ rows: await everyConnection(), fetch: stub.fetch });

  const byState = new Map(pages.map((page) => [page.slug, page.state]));
  assertEquals(byState.get("next_thing"), "error");
  assertEquals(byState.get("day_shape"), "error");
  assertEquals(byState.get("deploys"), "ok");
  assertEquals(byState.get("counters"), "ok");
  assertEquals(byState.get("one_number"), "ok");
  assertEquals(pages.length, KNOWN_SLUGS.length);
});

Deno.test("a page the wearer connected nothing for is still drawn, as not_connected", async () => {
  const pages = await buildAll({ rows: [], fetch: noFetch });

  assertEquals(pages.length, KNOWN_SLUGS.length);
  for (const page of pages) assertEquals(page.state, "not_connected");
});

Deno.test("no built page carries the credential it was built with", async () => {
  const healthy = await buildAll({
    rows: await everyConnection(),
    fetch: stubFetch(HEALTHY).fetch,
  });
  const refused = await buildAll({
    rows: await everyConnection(),
    // Every provider refusing at once, so the error messages are checked too.
    fetch: stubFetch({}).fetch,
  });

  for (const page of [...healthy, ...refused]) assertNoCredential(page, PROVIDERS);
  assert(refused.some((page) => page.state === "error"));
});
