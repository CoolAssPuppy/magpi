import { assert, assertEquals, assertRejects } from "@std/assert";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { assignedIssues } from "./linear.ts";

const API_KEY = "lin_api_fixture_linear_key";
const OAUTH_TOKEN = "fixture-linear-oauth-token";
const NOW = new Date("2026-08-22T15:00:00Z");

interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

interface Stub {
  fetch: typeof fetch;
  calls: Call[];
}

/** Reads what a client sent without leaning on the fetch init union. */
function sentCall(input: string | URL | Request, init: unknown): Call {
  const call: Call = { url: String(input), method: "GET", headers: {}, body: "" };
  if (typeof init !== "object" || init === null) return call;

  if ("method" in init && typeof init.method === "string") call.method = init.method;
  if ("body" in init && typeof init.body === "string") call.body = init.body;
  if ("headers" in init && typeof init.headers === "object" && init.headers !== null) {
    for (const [key, value] of Object.entries(init.headers)) {
      if (typeof value === "string") call.headers[key] = value;
    }
  }
  return call;
}

function stub(...replies: Reply[]): Stub {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push(sentCall(input, init));
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    return Promise.resolve(
      new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch: fetchImpl, calls };
}

const creds: ProviderCredentials = { accessToken: API_KEY, meta: {} };

function deps(stubbed: Stub): FetchDeps {
  return { fetch: stubbed.fetch, now: NOW, timeZone: "UTC" };
}

const ISSUES = {
  data: {
    viewer: {
      assignedIssues: {
        nodes: [
          { title: "Fix the login redirect", createdAt: "2026-08-20T10:00:00Z" },
          { title: "Ship the badge page\nwith the strip", createdAt: "2026-08-21T10:00:00Z" },
          { title: "Rotate the signing key", createdAt: "2026-08-19T10:00:00Z" },
        ],
      },
    },
  },
};

Deno.test("assignedIssues counts open issues and names the newest", async () => {
  assertEquals(await assignedIssues(creds, deps(stub({ body: ISSUES }))), {
    count: 3,
    recent: "Ship the badge page",
  });
});

Deno.test("assignedIssues posts a graphql query filtered to unfinished work", async () => {
  const stubbed = stub({ body: ISSUES });
  await assignedIssues(creds, deps(stubbed));

  const call = stubbed.calls[0];
  assertEquals(call.url, "https://api.linear.app/graphql");
  assertEquals(call.method, "POST");
  assert(call.body.includes("assignedIssues"));
  assert(call.body.includes("completed"));
  assert(call.body.includes("canceled"));
});

Deno.test("assignedIssues sends an api key raw and an oauth token as a bearer", async () => {
  const withKey = stub({ body: ISSUES });
  await assignedIssues(creds, deps(withKey));
  assertEquals(withKey.calls[0].headers.authorization, API_KEY);

  const withOauth = stub({ body: ISSUES });
  await assignedIssues({ accessToken: OAUTH_TOKEN, meta: {} }, deps(withOauth));
  assertEquals(withOauth.calls[0].headers.authorization, `Bearer ${OAUTH_TOKEN}`);
});

Deno.test("assignedIssues defaults rather than throwing on a malformed body", async () => {
  assertEquals(await assignedIssues(creds, deps(stub({ text: "<html>" }))), {
    count: 0,
    recent: null,
  });
  assertEquals(await assignedIssues(creds, deps(stub({ body: {} }))), { count: 0, recent: null });
  assertEquals(await assignedIssues(creds, deps(stub({ body: { data: { viewer: "nope" } } }))), {
    count: 0,
    recent: null,
  });
});

Deno.test("assignedIssues treats a graphql auth error as needing a reconnect", async () => {
  const stubbed = stub({
    body: {
      errors: [
        { message: `token ${API_KEY} rejected`, extensions: { code: "AUTHENTICATION_ERROR" } },
      ],
    },
  });
  const error = await assertRejects(() => assignedIssues(creds, deps(stubbed)), SourceError);
  assertEquals(error.provider, "linear");
  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(API_KEY));
});

Deno.test("assignedIssues treats any other graphql error as a passing failure", async () => {
  const stubbed = stub({
    body: { errors: [{ message: "internal", extensions: { code: "INTERNAL_SERVER_ERROR" } }] },
  });
  const error = await assertRejects(() => assignedIssues(creds, deps(stubbed)), SourceError);
  assertEquals(error.needsReconnect, false);
});

Deno.test(
  "assignedIssues asks for a reconnect on 401 and says nothing about the token",
  async () => {
    const stubbed = stub({ status: 401, body: { message: `bad key ${API_KEY}` } });
    const error = await assertRejects(() => assignedIssues(creds, deps(stubbed)), SourceError);
    assertEquals(error.needsReconnect, true);
    assert(!error.message.includes(API_KEY));
  },
);

Deno.test("assignedIssues does not ask for a reconnect on 500", async () => {
  const error = await assertRejects(
    () => assignedIssues(creds, deps(stub({ status: 500 }))),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(API_KEY));
});
