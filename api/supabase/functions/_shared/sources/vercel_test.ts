import { assert, assertEquals, assertRejects } from "@std/assert";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { deployments } from "./vercel.ts";

const TOKEN = "fixture-vercel-personal-token";
const NOW = new Date("2026-08-22T15:00:00Z");
const NOW_MS = NOW.getTime();

interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
}

interface Stub {
  fetch: typeof fetch;
  urls: string[];
}

function stub(...replies: Reply[]): Stub {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    urls.push(String(input));
    const reply = replies[Math.min(urls.length - 1, replies.length - 1)] ?? {};
    return Promise.resolve(
      new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch: fetchImpl, urls };
}

const creds: ProviderCredentials = { accessToken: TOKEN, meta: {} };

function deps(stubbed: Stub): FetchDeps {
  return { fetch: stubbed.fetch, now: NOW, timeZone: "UTC" };
}

const LIST = {
  deployments: [
    {
      name: "web",
      state: "READY",
      created: NOW_MS - 60_000,
      meta: { githubCommitMessage: "fix the nav\n\nlonger body nobody reads" },
    },
    // An older deployment of a project already seen is dropped.
    { name: "web", state: "ERROR", created: NOW_MS - 600_000, meta: {} },
    {
      name: "api",
      state: "BUILDING",
      created: NOW_MS - 120_000,
      meta: { gitlabCommitMessage: "bump deps" },
    },
    { name: "docs", state: "INITIALIZING", created: NOW_MS - 300_000, meta: {} },
    // No project name, so no label the badge could render.
    { state: "READY", created: NOW_MS },
  ],
};

const OPTIONS = { teamId: null, limit: 3 };

Deno.test("deployments returns one newest row per project, newest first", async () => {
  const rows = await deployments(creds, deps(stub({ body: LIST })), OPTIONS);
  assertEquals(rows, [
    { name: "web", state: "READY", commit: "fix the nav", ageMs: 60_000 },
    { name: "api", state: "BUILDING", commit: "bump deps", ageMs: 120_000 },
    { name: "docs", state: "QUEUED", commit: null, ageMs: 300_000 },
  ]);
});

Deno.test("deployments oversamples so one busy project cannot crowd the page out", async () => {
  const stubbed = stub({ body: LIST });
  await deployments(creds, deps(stubbed), OPTIONS);
  const url = new URL(stubbed.urls[0]);
  assertEquals(url.pathname, "/v6/deployments");
  assertEquals(url.searchParams.get("limit"), "12");
  assertEquals(url.searchParams.has("teamId"), false);
});

Deno.test("deployments scopes to a team when one is configured", async () => {
  const stubbed = stub({ body: LIST });
  await deployments(creds, deps(stubbed), { teamId: "team_abc", limit: 2 });
  assertEquals(new URL(stubbed.urls[0]).searchParams.get("teamId"), "team_abc");
});

Deno.test("deployments honours the limit after collapsing projects", async () => {
  const rows = await deployments(creds, deps(stub({ body: LIST })), { teamId: null, limit: 2 });
  assertEquals(
    rows.map((row) => row.name),
    ["web", "api"],
  );
});

Deno.test("deployments makes no request for a limit of zero", async () => {
  const stubbed = stub({ body: LIST });
  assertEquals(await deployments(creds, deps(stubbed), { teamId: null, limit: 0 }), []);
  assertEquals(stubbed.urls.length, 0);
});

Deno.test("deployments reads createdAt when created is absent", async () => {
  const stubbed = stub({
    body: { deployments: [{ name: "web", state: "ready", createdAt: NOW_MS - 5_000 }] },
  });
  assertEquals(await deployments(creds, deps(stubbed), OPTIONS), [
    { name: "web", state: "READY", commit: null, ageMs: 5_000 },
  ]);
});

Deno.test("deployments gives an empty list for a malformed body", async () => {
  assertEquals(await deployments(creds, deps(stub({ text: "<html>" })), OPTIONS), []);
  assertEquals(await deployments(creds, deps(stub({ body: {} })), OPTIONS), []);
  assertEquals(
    await deployments(
      creds,
      deps(stub({ body: { deployments: [null, 7, { meta: 3 }] } })),
      OPTIONS,
    ),
    [],
  );
});

Deno.test("deployments asks for a reconnect on 401 and says nothing about the token", async () => {
  const stubbed = stub({ status: 401, body: { error: { message: `bad token ${TOKEN}` } } });
  const error = await assertRejects(() => deployments(creds, deps(stubbed), OPTIONS), SourceError);
  assertEquals(error.provider, "vercel");
  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(TOKEN));
});

Deno.test("deployments does not ask for a reconnect on 500", async () => {
  const error = await assertRejects(
    () => deployments(creds, deps(stub({ status: 500 })), OPTIONS),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});
