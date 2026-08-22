import { assert, assertEquals, assertRejects } from "@std/assert";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { mentions } from "./slack.ts";

const TOKEN = "xoxp-fixture-slack-user-token";
const NOW = new Date("2026-08-22T15:00:00Z");

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

const IDENTITY = { body: { ok: true, user_id: "U0BADGE", user: "wearer" } };
const SEARCH = {
  body: {
    ok: true,
    messages: {
      total: 7,
      matches: [
        { text: "hey <@U0BADGE> can you look at this\nsecond line", ts: "1755878400.0001" },
        { text: "older one", ts: "1755870000.0001" },
      ],
    },
  },
};

Deno.test("mentions counts search hits and names the newest message", async () => {
  assertEquals(await mentions(creds, deps(stub(IDENTITY, SEARCH))), {
    count: 7,
    recent: "hey <@U0BADGE> can you look at this",
  });
});

Deno.test("mentions searches the wearer's own id, newest first", async () => {
  const stubbed = stub(IDENTITY, SEARCH);
  await mentions(creds, deps(stubbed));

  assertEquals(new URL(stubbed.urls[0]).pathname, "/api/auth.test");
  const search = new URL(stubbed.urls[1]);
  assertEquals(search.pathname, "/api/search.messages");
  assertEquals(search.searchParams.get("query"), "<@U0BADGE>");
  assertEquals(search.searchParams.get("sort"), "timestamp");
  assertEquals(search.searchParams.get("sort_dir"), "desc");
  assertEquals(search.searchParams.get("count"), "1");
});

Deno.test("mentions defaults rather than throwing on a malformed body", async () => {
  assertEquals(await mentions(creds, deps(stub(IDENTITY, { body: { ok: true } }))), {
    count: 0,
    recent: null,
  });
  assertEquals(
    await mentions(
      creds,
      deps(stub(IDENTITY, { body: { ok: true, messages: { matches: "nope" } } })),
    ),
    { count: 0, recent: null },
  );
});

Deno.test("mentions treats a 200 with ok false as a refusal, not an answer", async () => {
  const revoked = stub({ body: { ok: false, error: "token_revoked" } });
  const reconnect = await assertRejects(() => mentions(creds, deps(revoked)), SourceError);
  assertEquals(reconnect.provider, "slack");
  assertEquals(reconnect.needsReconnect, true);
  assert(!reconnect.message.includes(TOKEN));

  const throttled = stub(IDENTITY, { body: { ok: false, error: "ratelimited" } });
  const passing = await assertRejects(() => mentions(creds, deps(throttled)), SourceError);
  assertEquals(passing.needsReconnect, false);
});

Deno.test("mentions asks for a reconnect when slack answers without an identity", async () => {
  const stubbed = stub({ body: { ok: true } });
  const error = await assertRejects(() => mentions(creds, deps(stubbed)), SourceError);
  assertEquals(error.needsReconnect, true);
  assertEquals(stubbed.urls.length, 1);
});

Deno.test("mentions asks for a reconnect on 401 and says nothing about the token", async () => {
  const stubbed = stub({ status: 401, body: { error: `invalid_auth ${TOKEN}` } });
  const error = await assertRejects(() => mentions(creds, deps(stubbed)), SourceError);
  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(TOKEN));
});

Deno.test("mentions does not ask for a reconnect on 500", async () => {
  const error = await assertRejects(
    () => mentions(creds, deps(stub({ status: 500 }))),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});
