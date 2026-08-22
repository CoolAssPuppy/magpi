import { assert, assertEquals } from "@std/assert";

import { SUBJECT_MAX, TITLE_MAX } from "../badge-constants.ts";
import { trimPage } from "../envelope.ts";

import { build, slug } from "./deploys.ts";
import { buildPage } from "./mod.ts";
import {
  connectionRow,
  contextFor,
  FakeCache,
  fields,
  list,
  noFetch,
  NOW_MS,
  stubFetch,
  text,
} from "../testing/page_support.ts";

const VERCEL = "api.vercel.com/v6/deployments";

interface DeploymentOverrides {
  name?: string;
  state?: string;
  created?: number;
  meta?: Record<string, unknown>;
}

/** One row of Vercel's deployment list, in the shape the API returns it. */
function upstreamDeployment(overrides: DeploymentOverrides = {}): Record<string, unknown> {
  return {
    name: "web",
    state: "READY",
    created: NOW_MS - 60_000,
    meta: { githubCommitMessage: "fix the nav\n\nlonger body nobody reads" },
    ...overrides,
  };
}

/** One row as the page holds it in cache, which is the contract shape. */
function cachedDeployment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "web",
    state: "READY",
    commit: "fix the nav",
    ageMs: 60_000,
    ...overrides,
  };
}

const LIST = {
  deployments: [
    upstreamDeployment(),
    upstreamDeployment({
      name: "api",
      state: "BUILDING",
      created: NOW_MS - 120_000,
      meta: { githubCommitMessage: "bump deps" },
    }),
  ],
};

async function vercelRows(meta: Record<string, unknown> | null = null) {
  return [await connectionRow({ provider: "vercel", meta })];
}

Deno.test("deploys shows one line per project, newest first", async () => {
  const stub = stubFetch({ [VERCEL]: { body: LIST } });
  const page = await build(contextFor({ rows: await vercelRows(), fetch: stub.fetch }));

  assertEquals(page.state, "ok");
  assertEquals(fields(page.data).projects, [
    { name: "web", state: "READY", commit: "fix the nav", age_ms: 60_000 },
    { name: "api", state: "BUILDING", commit: "bump deps", age_ms: 120_000 },
  ]);
});

Deno.test(
  "deploys ages a held answer forward, so a deploy does not stay forty seconds old",
  async () => {
    const cache = new FakeCache();
    cache.put({
      provider: "vercel",
      cache_key: "deploys:personal",
      payload: { projects: [cachedDeployment()], cached_at: NOW_MS - 90_000 },
    });

    const page = await build(contextFor({ cache, rows: await vercelRows(), fetch: noFetch }));
    assertEquals(fields(list(fields(page.data).projects)[0]).age_ms, 60_000 + 90_000);
  },
);

Deno.test("deploys leaves an unstamped answer at the age it was given", async () => {
  const cache = new FakeCache();
  cache.put({
    provider: "vercel",
    cache_key: "deploys:personal",
    payload: { projects: [cachedDeployment()] },
  });

  const page = await build(contextFor({ cache, rows: await vercelRows(), fetch: noFetch }));
  assertEquals(fields(list(fields(page.data).projects)[0]).age_ms, 60_000);
});

Deno.test("deploys is empty when nothing has ever deployed", async () => {
  const stub = stubFetch({ [VERCEL]: { body: { deployments: [] } } });
  const page = await build(contextFor({ rows: await vercelRows(), fetch: stub.fetch }));

  assertEquals(page, { slug, state: "empty" });
});

Deno.test("deploys is not connected when the wearer has no vercel connection", async () => {
  const page = await build(contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug, state: "not_connected" });
});

Deno.test("deploys becomes its own error page when vercel refuses the credential", async () => {
  const stub = stubFetch({ [VERCEL]: { status: 403 } });
  const page = await buildPage(slug, contextFor({ rows: await vercelRows(), fetch: stub.fetch }));

  assertEquals(page?.state, "error");
  assertEquals(page?.message, "reconnect vercel on the connections page");
});

Deno.test("deploys cuts a project name and a commit line to what the badge draws", async () => {
  const stub = stubFetch({
    [VERCEL]: {
      body: {
        deployments: [
          upstreamDeployment({
            name: "p".repeat(200),
            meta: { githubCommitMessage: "c".repeat(200) },
          }),
        ],
      },
    },
  });
  const page = trimPage(await build(contextFor({ rows: await vercelRows(), fetch: stub.fetch })));

  const project = fields(list(fields(page.data).projects)[0]);
  assertEquals(text(project.name).length, TITLE_MAX);
  // A commit line is a subject, and takes the shorter cap.
  assertEquals(text(project.commit).length, SUBJECT_MAX);
});

Deno.test("deploys sends no more projects than the page draws", async () => {
  const cache = new FakeCache();
  const held = ["web", "api", "docs", "www", "admin", "jobs"].map((name) =>
    cachedDeployment({ name }),
  );
  cache.put({
    provider: "vercel",
    cache_key: "deploys:personal",
    payload: { projects: held, cached_at: NOW_MS },
  });

  const page = await build(contextFor({ cache, rows: await vercelRows(), fetch: noFetch }));
  assertEquals(list(fields(page.data).projects).length, 4);
});

Deno.test("deploys scopes to the team the connection names", async () => {
  const cache = new FakeCache();
  const stub = stubFetch({ [VERCEL]: { body: LIST } });
  await build(
    contextFor({
      cache,
      rows: await vercelRows({ team_id: "team_abc" }),
      fetch: stub.fetch,
    }),
  );

  assertEquals(new URL(stub.urls[0]).searchParams.get("teamId"), "team_abc");
  // A personal answer and a team answer are different answers, so they are held apart.
  assert(cache.read("vercel", "deploys:team_abc"));
  assertEquals(cache.read("vercel", "deploys:personal"), undefined);
});

Deno.test("deploys asks vercel once per cache window", async () => {
  const cache = new FakeCache();
  const stub = stubFetch({ [VERCEL]: { body: LIST } });
  const rows = await vercelRows();

  const first = await build(contextFor({ cache, rows, fetch: stub.fetch }));
  const second = await build(contextFor({ cache, rows, fetch: noFetch }));

  assertEquals(second, first);
  assertEquals(stub.urls.length, 1);
});
