import { assert, assertEquals, assertRejects } from "@std/assert";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { reviewRequests } from "./github.ts";

const TOKEN = "ghp_fixture_github_token";
const NOW = new Date("2026-08-22T15:00:00Z");

interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
}

interface Stub {
  fetch: typeof fetch;
  urls: string[];
  headers: Array<Record<string, string>>;
}

/** Reads the headers a client sent without leaning on the fetch init union. */
function sentHeaders(init: unknown): Record<string, string> {
  if (typeof init !== "object" || init === null || !("headers" in init)) return {};
  const carried: unknown = init.headers;
  if (typeof carried !== "object" || carried === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(carried)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function stub(...replies: Reply[]): Stub {
  const urls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    urls.push(String(input));
    headers.push(sentHeaders(init));
    const reply = replies[Math.min(urls.length - 1, replies.length - 1)] ?? {};
    return Promise.resolve(
      new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch: fetchImpl, urls, headers };
}

const creds: ProviderCredentials = { accessToken: TOKEN, meta: {} };

function deps(stubbed: Stub): FetchDeps {
  return { fetch: stubbed.fetch, now: NOW, timeZone: "UTC" };
}

Deno.test("reviewRequests reads the total and the newest title", async () => {
  const stubbed = stub({
    body: {
      total_count: 4,
      items: [{ title: "Add the badge page\nwith notes" }, { title: "Older one" }],
    },
  });
  assertEquals(await reviewRequests(creds, deps(stubbed)), {
    count: 4,
    recent: "Add the badge page",
  });
});

Deno.test("reviewRequests searches open pull requests waiting on the wearer", async () => {
  const stubbed = stub({ body: { total_count: 0, items: [] } });
  await reviewRequests(creds, deps(stubbed));

  const url = new URL(stubbed.urls[0]);
  assertEquals(url.pathname, "/search/issues");
  assertEquals(url.searchParams.get("q"), "is:open is:pr review-requested:@me");
  assertEquals(url.searchParams.get("sort"), "created");
  assertEquals(url.searchParams.get("order"), "desc");
  assertEquals(url.searchParams.get("per_page"), "1");
  assertEquals(stubbed.headers[0].accept, "application/vnd.github+json");
});

Deno.test("reviewRequests defaults rather than throwing on a malformed body", async () => {
  assertEquals(await reviewRequests(creds, deps(stub({ text: "nope" }))), {
    count: 0,
    recent: null,
  });
  assertEquals(
    await reviewRequests(creds, deps(stub({ body: { total_count: "four", items: {} } }))),
    { count: 0, recent: null },
  );
});

Deno.test(
  "reviewRequests asks for a reconnect on 401 and says nothing about the token",
  async () => {
    const stubbed = stub({ status: 401, body: { message: `Bad credentials ${TOKEN}` } });
    const error = await assertRejects(() => reviewRequests(creds, deps(stubbed)), SourceError);
    assertEquals(error.provider, "github");
    assertEquals(error.needsReconnect, true);
    assert(!error.message.includes(TOKEN));
  },
);

Deno.test("reviewRequests does not ask for a reconnect on 500", async () => {
  const error = await assertRejects(
    () => reviewRequests(creds, deps(stub({ status: 500 }))),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});
