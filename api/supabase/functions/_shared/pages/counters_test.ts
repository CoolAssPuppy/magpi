import { assert, assertEquals } from "@std/assert";

import { COUNTER_MAX, SUBJECT_MAX } from "../badge-constants.ts";
import { trimPage } from "../envelope.ts";

import { build, slug } from "./counters.ts";
import {
  connectionRow,
  contextFor,
  FakeCache,
  fields,
  list,
  noFetch,
  type Reply,
  stubFetch,
  text,
} from "./support_test.ts";

// The first fragment that matches wins, so the single message read is listed
// before the list call it follows.
const GMAIL_MESSAGE = "format=metadata";
const GMAIL_LIST = "gmail.googleapis.com";
const LINEAR = "api.linear.app";
const SLACK_IDENTITY = "slack.com/api/auth.test";
const SLACK_SEARCH = "slack.com/api/search.messages";
const GITHUB = "api.github.com";
const NOTION = "api.notion.com";

function gmailRoutes(count = 5, subject = "deploy failed"): Record<string, Reply> {
  return {
    [GMAIL_MESSAGE]: { body: { payload: { headers: [{ name: "Subject", value: subject }] } } },
    [GMAIL_LIST]: { body: { resultSizeEstimate: count, messages: [{ id: "m1" }] } },
  };
}

const LINEAR_ROUTES: Record<string, Reply> = {
  [LINEAR]: {
    body: {
      data: {
        viewer: {
          assignedIssues: {
            nodes: [
              { title: "fix login", createdAt: "2026-01-14T10:00:00Z" },
              { title: "tidy the docs", createdAt: "2026-01-12T10:00:00Z" },
            ],
          },
        },
      },
    },
  },
};

const SLACK_ROUTES: Record<string, Reply> = {
  [SLACK_IDENTITY]: { body: { ok: true, user_id: "U123" } },
  [SLACK_SEARCH]: { body: { ok: true, messages: { total: 2, matches: [{ text: "ping" }] } } },
};

const GITHUB_ROUTES: Record<string, Reply> = {
  [GITHUB]: { body: { total_count: 3, items: [{ title: "bump deps" }] } },
};

const NOTION_ROUTES: Record<string, Reply> = {
  [NOTION]: {
    body: {
      results: [
        {
          last_edited_time: "2026-01-14T10:00:00Z",
          properties: { Name: { type: "title", title: [{ plain_text: "spec" }] } },
        },
      ],
    },
  },
};

async function rowsFor(providers: string[]) {
  return await Promise.all(providers.map((provider) => connectionRow({ provider })));
}

Deno.test("counters shows one number per provider the wearer connected", async () => {
  const stub = stubFetch({ ...gmailRoutes(), ...LINEAR_ROUTES });
  const page = await build(
    contextFor({ rows: await rowsFor(["google", "linear"]), fetch: stub.fetch }),
  );

  assertEquals(page.state, "ok");
  assertEquals(fields(page.data).counters, [
    { label: "Gmail", value: 5, delta: 0, recent: "deploy failed" },
    { label: "Linear", value: 2, delta: 0, recent: "fix login" },
  ]);
});

Deno.test("counters reports the change since the last read, not the total", async () => {
  const cache = new FakeCache();
  cache.put({ provider: "google", cache_key: "counter_previous", payload: { Gmail: 2 } });
  const stub = stubFetch(gmailRoutes());

  const page = await build(
    contextFor({ cache, rows: await rowsFor(["google"]), fetch: stub.fetch }),
  );

  assertEquals(fields(page.data).counters, [
    { label: "Gmail", value: 5, delta: 3, recent: "deploy failed" },
  ]);
  // A count that rose blinks once rather than on every poll.
  assertEquals(fields(page.data).changed_age_ms, 0);
});

Deno.test("counters records this read as the comparison point for the next one", async () => {
  const cache = new FakeCache();
  const stub = stubFetch(gmailRoutes());
  await build(contextFor({ cache, rows: await rowsFor(["google"]), fetch: stub.fetch }));

  assertEquals(cache.read("google", "counter_previous")?.payload, { Gmail: 5 });
});

Deno.test("counters does not blink when nothing went up", async () => {
  const cache = new FakeCache();
  cache.put({ provider: "google", cache_key: "counter_previous", payload: { Gmail: 9 } });
  const stub = stubFetch(gmailRoutes());

  const page = await build(
    contextFor({ cache, rows: await rowsFor(["google"]), fetch: stub.fetch }),
  );

  assertEquals(fields(page.data).changed_age_ms, Number.MAX_SAFE_INTEGER);
});

Deno.test("counters is not connected when the wearer connected nothing it can count", async () => {
  const page = await build(contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug, state: "not_connected" });
});

Deno.test("counters is empty when a connected provider holds no usable credential", async () => {
  // Connected, but the row that would carry the secret is gone.
  const page = await build(
    contextFor({ rows: [], connected: new Set(["linear"]), fetch: noFetch }),
  );
  assertEquals(page, { slug, state: "empty" });
});

Deno.test("counters keeps the numbers it has when one provider refuses", async () => {
  const stub = stubFetch({ ...gmailRoutes(), [LINEAR]: { status: 401 } });
  const page = await build(
    contextFor({ rows: await rowsFor(["google", "linear"]), fetch: stub.fetch }),
  );

  assertEquals(page.state, "ok");
  // The one that refused is left out. Drawing it as zero would tell the
  // wearer nothing is waiting there, which is not what happened.
  assertEquals(fields(page.data).counters, [
    { label: "Gmail", value: 5, delta: 0, recent: "deploy failed" },
  ]);
});

Deno.test("counters says the accounts could not be reached when none of them answer", async () => {
  // Nothing routed, so every provider refuses at once.
  const stub = stubFetch({});
  const page = await build(
    contextFor({ rows: await rowsFor(["google", "linear"]), fetch: stub.fetch }),
  );

  assertEquals(page.state, "error");
  const message = text(page.message);
  assert(message.includes("Could not reach those accounts"));
  assert(message.length <= SUBJECT_MAX);
  assertEquals(page.data, undefined);
});

Deno.test("counters keeps a real zero, which is not the same as a failure", async () => {
  // An empty inbox: a number the wearer can trust, unlike a source that refused.
  const stub = stubFetch({ [GMAIL_LIST]: { body: { resultSizeEstimate: 0 } } });
  const page = await build(contextFor({ rows: await rowsFor(["google"]), fetch: stub.fetch }));

  assertEquals(page.state, "ok");
  assertEquals(fields(page.data).counters, [{ label: "Gmail", value: 0, delta: 0, recent: null }]);
});

Deno.test("counters draws no more numbers than the badge has room for", async () => {
  const stub = stubFetch({
    ...gmailRoutes(),
    ...LINEAR_ROUTES,
    ...SLACK_ROUTES,
    ...GITHUB_ROUTES,
    ...NOTION_ROUTES,
  });
  const page = await build(
    contextFor({
      rows: await rowsFor(["google", "linear", "slack", "github", "notion"]),
      fetch: stub.fetch,
    }),
  );

  const counters = list(fields(page.data).counters);
  assertEquals(counters.length, COUNTER_MAX);
  assertEquals(
    counters.map((counter) => fields(counter).label),
    ["Gmail", "Linear", "Slack", "Reviews"],
  );
  // The provider that did not fit was never asked.
  assert(!stub.urls.some((url) => url.includes(NOTION)));
});

Deno.test("counters cuts a subject line to what the badge draws", async () => {
  const stub = stubFetch(gmailRoutes(5, "s".repeat(200)));
  const page = trimPage(
    await build(contextFor({ rows: await rowsFor(["google"]), fetch: stub.fetch })),
  );

  const counter = fields(list(fields(page.data).counters)[0]);
  assertEquals(text(counter.recent).length, SUBJECT_MAX);
});

Deno.test("counters counts the mailbox query the wearer configured", async () => {
  const stub = stubFetch(gmailRoutes());
  await build(
    contextFor({
      rows: await rowsFor(["google"]),
      fetch: stub.fetch,
      settings: { gmail_query: "is:unread from:oncall" },
    }),
  );

  assertEquals(new URL(stub.urls[0]).searchParams.get("q"), "is:unread from:oncall");
});

Deno.test("counters counts the notion database the wearer chose", async () => {
  const stub = stubFetch(NOTION_ROUTES);
  const page = await build(
    contextFor({
      rows: await rowsFor(["notion"]),
      fetch: stub.fetch,
      settings: { notion_database_id: "db_9f3a" },
    }),
  );

  assert(stub.urls[0].endsWith("/databases/db_9f3a/query"));
  assertEquals(fields(page.data).counters, [
    { label: "Notion", value: 1, delta: 0, recent: "spec" },
  ]);
});

Deno.test("counters searches everything shared with it when no database is chosen", async () => {
  const stub = stubFetch(NOTION_ROUTES);
  await build(contextFor({ rows: await rowsFor(["notion"]), fetch: stub.fetch }));

  assert(stub.urls[0].endsWith("/v1/search"));
});

Deno.test("counters asks each provider once per cache window", async () => {
  const cache = new FakeCache();
  const stub = stubFetch(gmailRoutes());
  const rows = await rowsFor(["google"]);

  await build(contextFor({ cache, rows, fetch: stub.fetch }));
  const before = stub.urls.length;
  await build(contextFor({ cache, rows, fetch: noFetch }));

  assertEquals(stub.urls.length, before);
  assert(cache.read("google", "counter"));
});
