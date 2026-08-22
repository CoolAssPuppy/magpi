import { assert, assertEquals } from "@std/assert";

import { SUBJECT_MAX, TITLE_MAX } from "../badge-constants.ts";
import { trimPage } from "../envelope.ts";

import { build, slug } from "./one_number.ts";
import { buildPage } from "./mod.ts";
import {
  connectionRow,
  contextFor,
  FakeCache,
  fields,
  noFetch,
  stubFetch,
  text,
} from "../testing/page_support.ts";

const POSTHOG = "posthog.com";

const META = { host: "us.posthog.com", project_id: "64213", insight_id: "aX9k2Lp" };

function insightBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "signups",
    result: [{ label: "series", data: [10, 12, 15] }],
    last_refresh: "2026-01-15T08:56:00Z",
    ...overrides,
  };
}

async function posthogRows(meta: Record<string, unknown> | null = META) {
  return [await connectionRow({ provider: "posthog", meta })];
}

Deno.test("one_number shows the latest point of the insight the connection names", async () => {
  const stub = stubFetch({ [POSTHOG]: { body: insightBody() } });
  const page = await build(contextFor({ rows: await posthogRows(), fetch: stub.fetch }));

  assertEquals(page.state, "ok");
  assertEquals(page.data, {
    label: "signups",
    value: 15,
    unit: null,
    spark: [10, 12, 15],
    delta_pct: 50,
    updated: "4m ago",
    source: "PostHog",
  });
  assertEquals(new URL(stub.urls[0]).pathname, "/api/projects/64213/insights/aX9k2Lp/");
});

Deno.test("one_number is empty until the wearer picks an insight", async () => {
  const page = await build(contextFor({ rows: await posthogRows({ host: "us.posthog.com" }) }));
  assertEquals(page, { slug, state: "empty" });
});

Deno.test("one_number is empty when the held reading carries no number", async () => {
  const cache = new FakeCache();
  cache.put({
    provider: "posthog",
    cache_key: "insight:aX9k2Lp",
    payload: { label: "signups", spark: [] },
  });

  const page = await build(contextFor({ cache, rows: await posthogRows(), fetch: noFetch }));
  assertEquals(page, { slug, state: "empty" });
});

Deno.test("one_number is not connected when the wearer has no posthog connection", async () => {
  const page = await build(contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug, state: "not_connected" });
});

Deno.test("one_number becomes its own error page when posthog refuses the credential", async () => {
  const stub = stubFetch({ [POSTHOG]: { status: 401 } });
  const page = await buildPage(slug, contextFor({ rows: await posthogRows(), fetch: stub.fetch }));

  assertEquals(page?.state, "error");
  assert(text(page?.message).startsWith("reconnect posthog"));
});

Deno.test("one_number says what is missing when the connection is half configured", async () => {
  const page = await buildPage(
    slug,
    contextFor({ rows: await posthogRows({ insight_id: "aX9k2Lp" }), fetch: noFetch }),
  );

  assertEquals(page?.state, "error");
  const message = text(page?.message);
  assert(message.startsWith("set the posthog host"));
  assertEquals(message.length, SUBJECT_MAX);
});

Deno.test("one_number reports no change over a window that started at zero", async () => {
  const stub = stubFetch({
    [POSTHOG]: { body: insightBody({ result: [{ data: [0, 4, 9] }] }) },
  });
  const page = await build(contextFor({ rows: await posthogRows(), fetch: stub.fetch }));

  assertEquals(fields(page.data).delta_pct, null);
  assertEquals(fields(page.data).value, 9);
});

Deno.test("one_number cuts a label longer than the badge can draw", async () => {
  const stub = stubFetch({ [POSTHOG]: { body: insightBody({ name: "n".repeat(200) }) } });
  const page = trimPage(await build(contextFor({ rows: await posthogRows(), fetch: stub.fetch })));

  assertEquals(text(fields(page.data).label).length, TITLE_MAX);
});

Deno.test("one_number asks posthog once per cache window", async () => {
  const cache = new FakeCache();
  const stub = stubFetch({ [POSTHOG]: { body: insightBody() } });
  const rows = await posthogRows();

  const first = await build(contextFor({ cache, rows, fetch: stub.fetch }));
  const second = await build(contextFor({ cache, rows, fetch: noFetch }));

  assertEquals(second, first);
  assertEquals(stub.urls.length, 1);
});
