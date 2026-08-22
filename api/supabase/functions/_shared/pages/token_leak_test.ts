// Whatever goes wrong, a provider secret must never reach the badge.
//
// buildPage catches every throw and puts the message on the screen through
// errorPage, which truncates but does not sanitize. Truncation is not
// redaction: a forty character prefix of "Bearer sk-live-..." is still most of
// a key. sources/leak_test.ts pins the clients; this pins the layer above
// them, where the message actually becomes something a person can read off a
// desk.

import { assert } from "@std/assert";

import type { ConnectionRow } from "../connections.ts";
import { encryptProviderToken } from "../provider_tokens.ts";
import { type BuildContext, buildPage, REGISTRY } from "./mod.ts";
import { type StubDb, stubDb } from "../testing/stub_db.ts";

const USER = "11111111-1111-4111-a111-111111111111";

/** Distinctive enough that any fragment of it is unmistakable in a payload. */
const SECRET = "zqx-LIVE-SECRET-0f1e2d3c4b5a69788796a5b4c3d2e1f0-tail";

/** Every provider a page can require, so each builder finds its credential. */
const PROVIDERS = ["google", "vercel", "posthog", "linear", "slack", "notion", "github"];

const KEY_ENV = "TOKEN_ENCRYPTION_KEY";

async function connectionRows(): Promise<ConnectionRow[]> {
  const rows: ConnectionRow[] = [];
  for (const provider of PROVIDERS) {
    rows.push({
      id: `conn-${provider}`,
      provider,
      label: null,
      access_token_enc: await encryptProviderToken(SECRET, {
        userId: USER,
        provider,
      }),
      refresh_token_enc: null,
      expires_at: null,
      status: "active",
      meta: {},
    });
  }
  return rows;
}

/**
 * The ways an upstream call goes wrong, each carrying the secret the way a
 * careless client or a chatty provider would.
 */
const FAILURES: Record<string, () => Promise<Response>> = {
  "a client that put the token in its own error": () => {
    throw new Error(`request failed for token ${SECRET}`);
  },

  "a provider that echoed the header back": () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: `invalid credentials: Bearer ${SECRET}` }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ),

  "a gateway that returned the whole request": () =>
    Promise.resolve(
      new Response(`upstream rejected: Authorization: Bearer ${SECRET}`, {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
    ),

  "a transport failure naming the url it was calling": () => {
    throw new TypeError(`error sending request for url (https://api.example/x?key=${SECRET})`);
  },

  "a body that is not the json it claimed": () =>
    Promise.resolve(
      new Response(`<html>${SECRET}</html>`, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
};

/** Any run of the secret long enough to be worth stealing. */
function leaks(text: string): string | null {
  const WINDOW = 8;
  for (let start = 0; start + WINDOW <= SECRET.length; start += 1) {
    const fragment = SECRET.slice(start, start + WINDOW);
    if (text.includes(fragment)) return fragment;
  }
  return null;
}

async function withStub(body: (stub: StubDb) => Promise<void>): Promise<void> {
  // Every cache read misses, so the loader runs and the failure is reached.
  const stub = stubDb(({ method }) => (method === "GET" ? { body: [] } : {}));
  try {
    await body(stub);
  } finally {
    await stub.close();
  }
}

async function withKey(body: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get(KEY_ENV);
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  Deno.env.set(KEY_ENV, btoa(String.fromCharCode(...bytes)));
  try {
    await body();
  } finally {
    if (previous === undefined) Deno.env.delete(KEY_ENV);
    else Deno.env.set(KEY_ENV, previous);
  }
}

Deno.test("no page puts a provider secret on the badge, however the call fails", async () => {
  await withKey(async () => {
    const rows = await connectionRows();

    // One stub for every combination. Standing up twenty-five servers and
    // twenty-five clients to make the same assertion is slower and leaves more
    // to go wrong than the thing under test.
    await withStub(async (stub) => {
      for (const [description, failure] of Object.entries(FAILURES)) {
        for (const slug of REGISTRY.keys()) {
          const context: BuildContext = {
            db: stub.db,
            userId: USER,
            settings: {},
            rows,
            connected: new Set(PROVIDERS),
            deps: {
              fetch: failure as typeof fetch,
              now: new Date(),
              timeZone: "UTC",
            },
            now: new Date(),
          };

          const page = await buildPage(slug, context);
          const rendered = JSON.stringify(page);
          const found = leaks(rendered);

          assert(found === null, `${slug} leaked "${found}" with ${description}: ${rendered}`);
        }
      }
    });
  });
});

Deno.test("a page that fails still says so, rather than going blank", async () => {
  await withKey(async () => {
    const rows = await connectionRows();

    await withStub(async (stub) => {
      const context: BuildContext = {
        db: stub.db,
        userId: USER,
        settings: {},
        rows,
        connected: new Set(PROVIDERS),
        deps: {
          fetch: (() => {
            throw new Error("upstream is down");
          }) as unknown as typeof fetch,
          now: new Date(),
          timeZone: "UTC",
        },
        now: new Date(),
      };

      for (const slug of REGISTRY.keys()) {
        const page = await buildPage(slug, context);
        assert(page, `${slug} built nothing`);
        assert(
          page.state === "error" || page.state === "empty" || page.state === "not_connected",
          `${slug} answered ${page.state} for a dead provider`,
        );
      }
    });
  });
});

Deno.test("one dead provider never takes another page down with it", async () => {
  await withKey(async () => {
    const rows = await connectionRows();

    await withStub(async (stub) => {
      const context: BuildContext = {
        db: stub.db,
        userId: USER,
        settings: {},
        rows,
        connected: new Set(PROVIDERS),
        deps: {
          fetch: (() => {
            throw new Error("upstream is down");
          }) as unknown as typeof fetch,
          now: new Date(),
          timeZone: "UTC",
        },
        now: new Date(),
      };

      const built = await Promise.all([...REGISTRY.keys()].map((slug) => buildPage(slug, context)));

      // Every page answers. None of them throws, and none returns null for a
      // slug the registry knows.
      assert(
        built.every((page) => page !== null),
        "a known page built nothing",
      );
    });
  });
});
