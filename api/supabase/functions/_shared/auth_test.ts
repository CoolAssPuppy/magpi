import { assert, assertEquals, assertRejects } from "@std/assert";

import { requireUser } from "./auth.ts";
import { ApiError } from "./errors.ts";
import { stubDb, type StubDb, type StubReply, type StubRequest } from "./testing/stub_db.ts";

const USER = "11111111-1111-4111-a111-111111111111";

/**
 * requireUser builds its own client from the environment, so the stub's port
 * has to be there before it runs.
 */
async function withAuthServer(
  reply: (request: StubRequest) => StubReply | undefined,
  body: (stub: StubDb) => Promise<void>,
  env: Record<string, string | null> = {},
): Promise<void> {
  const stub = stubDb(reply);
  const vars: Record<string, string | null> = {
    SUPABASE_URL: stub.url,
    SB_PUBLISHABLE_KEY: "sb_publishable_test",
    SB_PUBLISHABLE_KEYS: null,
    SUPABASE_PUBLISHABLE_KEY: null,
    SUPABASE_PUBLISHABLE_KEYS: null,
    ...env,
  };
  const previous = new Map<string, string | undefined>();
  for (const name of Object.keys(vars)) previous.set(name, Deno.env.get(name));

  try {
    for (const [name, value] of Object.entries(vars)) {
      if (value === null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    await body(stub);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    await stub.close();
  }
}

function headers(authorization?: string): Headers {
  return new Headers(authorization ? { authorization } : {});
}

/** What GoTrue answers on /auth/v1/user for a good token. */
const SIGNED_IN: StubReply = { body: { id: USER, email: "someone@example.com" } };

Deno.test("requireUser resolves the caller from a valid session", async () => {
  await withAuthServer(
    () => SIGNED_IN,
    async () => {
      assertEquals(await requireUser(headers("Bearer good-token")), {
        id: USER,
        email: "someone@example.com",
      });
    },
  );
});

Deno.test(
  "requireUser validates against the auth server rather than decoding the token",
  async () => {
    await withAuthServer(
      () => SIGNED_IN,
      async (stub) => {
        await requireUser(headers("Bearer good-token"));

        // A locally decoded token would reach no server at all, and would accept
        // one that had since been revoked or signed with a rotated key.
        assert(stub.requests.length > 0, "nothing was asked of the auth server");
        assert(
          stub.requests.some((request) => request.path.includes("/auth/v1/user")),
          stub.requests.map((request) => request.path).join(", "),
        );
      },
    );
  },
);

Deno.test("requireUser reports an account with no email address as having none", async () => {
  await withAuthServer(
    () => ({ body: { id: USER } }),
    async () => {
      assertEquals((await requireUser(headers("Bearer good-token"))).email, null);
    },
  );
});

Deno.test("requireUser refuses a request carrying no bearer token", async () => {
  await withAuthServer(
    () => SIGNED_IN,
    async () => {
      const error = await assertRejects(() => requireUser(headers()), ApiError);
      assertEquals(error.status, 401);
    },
  );
});

Deno.test("requireUser refuses an authorization header that is not a bearer token", async () => {
  await withAuthServer(
    () => SIGNED_IN,
    async () => {
      for (const value of ["Basic abc", "good-token", "Bearer"]) {
        const error = await assertRejects(() => requireUser(headers(value)), ApiError);
        assertEquals(error.status, 401, `${value} should be refused`);
      }
    },
  );
});

Deno.test("requireUser refuses a token the auth server rejects", async () => {
  await withAuthServer(
    () => ({ body: { message: "invalid claim" }, status: 401 }),
    async () => {
      const error = await assertRejects(() => requireUser(headers("Bearer stale-token")), ApiError);
      assertEquals(error.status, 401);
    },
  );
});

Deno.test("requireUser never repeats the token back in its refusal", async () => {
  await withAuthServer(
    () => ({ body: { message: "invalid claim" }, status: 401 }),
    async () => {
      const error = await assertRejects(
        () => requireUser(headers("Bearer secret-token-value")),
        ApiError,
      );

      assert(!error.message.includes("secret-token-value"), error.message);
      assert(!JSON.stringify(error.detail ?? {}).includes("secret-token-value"));
    },
  );
});

Deno.test("requireUser fails closed when the server is not configured", async () => {
  await withAuthServer(
    () => SIGNED_IN,
    async () => {
      const error = await assertRejects(() => requireUser(headers("Bearer good-token")), ApiError);
      assertEquals(error.status, 500);
    },
    { SUPABASE_URL: null },
  );

  await withAuthServer(
    () => SIGNED_IN,
    async () => {
      const error = await assertRejects(() => requireUser(headers("Bearer good-token")), ApiError);
      assertEquals(error.status, 500);
    },
    { SB_PUBLISHABLE_KEY: null },
  );
});
