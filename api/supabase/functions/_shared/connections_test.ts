import { assert, assertEquals } from "@std/assert";

import {
  activeProviders,
  credentialsFor,
  loadConnections,
  markConnectionError,
  type ConnectionRow,
} from "./connections.ts";
import { encryptProviderToken } from "./provider_tokens.ts";
import {
  requestsFor,
  stubDb,
  type StubDb,
  type StubReply,
  type StubRequest,
} from "./testing/stub_db.ts";

const USER = "11111111-1111-4111-a111-111111111111";
const KEY_ENV = "TOKEN_ENCRYPTION_KEY";

function row(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: "conn-google",
    provider: "google",
    label: null,
    access_token_enc: "ciphertext",
    refresh_token_enc: null,
    expires_at: null,
    status: "active",
    meta: null,
    ...overrides,
  };
}

async function withStub(
  reply: (request: StubRequest) => StubReply | undefined,
  body: (stub: StubDb) => Promise<void>,
): Promise<void> {
  const stub = stubDb(reply);
  try {
    await body(stub);
  } finally {
    await stub.close();
  }
}

/** Runs a body with a real encryption key set, restoring the environment after. */
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

Deno.test("loadConnections reads only the caller's own rows", async () => {
  await withStub(
    () => ({ body: [row()] }),
    async (stub) => {
      const rows = await loadConnections(stub.db, USER);

      assertEquals(rows.length, 1);
      const [request] = requestsFor(stub, "connections");
      assert(request, "no read was made");
      assert(request.query.includes(`user_id=eq.${USER}`), request.query);
    },
  );
});

Deno.test("loadConnections never selects a column the badge has no use for", async () => {
  await withStub(
    () => ({ body: [] }),
    async (stub) => {
      await loadConnections(stub.db, USER);

      const [request] = requestsFor(stub, "connections");
      assert(request);
      assert(!request.query.includes("error_message"), request.query);
    },
  );
});

Deno.test("loadConnections answers with nothing when the read failed", async () => {
  await withStub(
    () => ({ body: { message: "boom" }, status: 500 }),
    async (stub) => {
      assertEquals(await loadConnections(stub.db, USER), []);
    },
  );
});

Deno.test("only an active connection holding a secret can answer", () => {
  const providers = activeProviders([
    row({ provider: "google" }),
    row({ provider: "linear", status: "error" }),
    row({ provider: "slack", status: "revoked" }),
    row({ provider: "vercel", access_token_enc: null }),
  ]);

  assertEquals([...providers], ["google"]);
});

Deno.test("a provider in the error state is present but cannot answer", () => {
  // The page draws not_connected and the connections page says reconnect,
  // rather than the badge showing a failure it cannot act on.
  assertEquals(activeProviders([row({ status: "error" })]).size, 0);
});

Deno.test("credentialsFor decrypts the secret for one provider", async () => {
  await withKey(async () => {
    const enc = await encryptProviderToken("secret-value", { userId: USER, provider: "google" });
    const credentials = await credentialsFor([row({ access_token_enc: enc })], USER, "google");

    assertEquals(credentials?.accessToken, "secret-value");
    assertEquals(credentials?.meta, {});
  });
});

Deno.test("credentialsFor carries a provider's own settings alongside the secret", async () => {
  await withKey(async () => {
    const enc = await encryptProviderToken("secret-value", { userId: USER, provider: "notion" });
    const credentials = await credentialsFor(
      [row({ provider: "notion", access_token_enc: enc, meta: { database_id: "db-1" } })],
      USER,
      "notion",
    );

    assertEquals(credentials?.meta, { database_id: "db-1" });
  });
});

Deno.test("credentialsFor refuses a provider the caller has not connected", async () => {
  assertEquals(await credentialsFor([row()], USER, "linear"), null);
});

Deno.test("credentialsFor refuses a connection that is not active", async () => {
  assertEquals(await credentialsFor([row({ status: "error" })], USER, "google"), null);
  assertEquals(await credentialsFor([row({ status: "revoked" })], USER, "google"), null);
});

Deno.test("credentialsFor refuses a row holding no secret", async () => {
  assertEquals(await credentialsFor([row({ access_token_enc: null })], USER, "google"), null);
});

Deno.test("a secret is bound to its owner, so another account cannot decrypt it", async () => {
  await withKey(async () => {
    const enc = await encryptProviderToken("secret-value", { userId: USER, provider: "google" });
    const other = "22222222-2222-4222-a222-222222222222";

    // The user id is the additional authenticated data, so the same ciphertext
    // under a different owner fails to authenticate rather than decrypting.
    let failed = false;
    try {
      await credentialsFor([row({ access_token_enc: enc })], other, "google");
    } catch {
      failed = true;
    }
    assert(failed, "a token decrypted under the wrong account");
  });
});

Deno.test("markConnectionError records the refusal against one row", async () => {
  await withStub(
    () => ({}),
    async (stub) => {
      await markConnectionError(stub.db, USER, "google", "token expired");

      const [request] = requestsFor(stub, "connections");
      assert(request, "nothing was written");
      assert(request.query.includes(`user_id=eq.${USER}`), request.query);
      assert(request.query.includes("provider=eq.google"), request.query);

      const patch = request.body;
      assert(patch && typeof patch === "object" && !Array.isArray(patch));
      assertEquals((patch as Record<string, unknown>).status, "error");
    },
  );
});
