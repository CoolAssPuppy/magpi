import { assert, assertEquals, assertRejects } from "@std/assert";

import { audit, enforceRateLimits, type RateLimitRule, serviceClient } from "./db.ts";
import { ApiError } from "./errors.ts";
import { type StubDb, stubDb, type StubReply, type StubRequest } from "./testing/stub_db.ts";

/*
 * enforceRateLimits samples a housekeeping prune at one call in two hundred
 * and deliberately does not await it, which is right in production and a
 * dangling request in a test: it outlives the stub server perhaps one run in a
 * hundred. Pinned off for the file, and turned on by the one case about it.
 */
const real_random = Math.random;
Math.random = () => 0.5;

const RULES: RateLimitRule[] = [
  { bucket: "ip:203.0.113.1", limit: 60, windowSeconds: 60 },
  { bucket: "badge:abc", limit: 10, windowSeconds: 60 },
];

/** What consume_rate_limit returns. */
function allowance(allowed: boolean, retryAfter = 0): StubReply {
  return {
    body: { allowed, remaining: allowed ? 5 : 0, retry_after_s: retryAfter },
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

/** Runs a body with an environment, restoring it after. */
async function withEnv(
  vars: Record<string, string | null>,
  body: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const name of Object.keys(vars)) previous.set(name, Deno.env.get(name));
  try {
    for (const [name, value] of Object.entries(vars)) {
      if (value === null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    await body();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

Deno.test("serviceClient refuses to run unconfigured rather than falling back", async () => {
  await withEnv({ SUPABASE_URL: null, SB_SECRET_KEY: "sb_secret_test" }, () => {
    const error = assertThrowsApi(() => serviceClient());
    assertEquals(error.status, 500);
    return Promise.resolve();
  });

  await withEnv(
    {
      SUPABASE_URL: "http://127.0.0.1:1",
      SB_SECRET_KEY: null,
      SB_SECRET_KEYS: null,
      SUPABASE_SECRET_KEY: null,
      SUPABASE_SECRET_KEYS: null,
    },
    () => {
      const error = assertThrowsApi(() => serviceClient());
      assertEquals(error.status, 500);
      return Promise.resolve();
    },
  );
});

Deno.test("serviceClient builds a client when it is configured", async () => {
  await withEnv(
    {
      SUPABASE_URL: "http://127.0.0.1:1",
      SB_SECRET_KEY: "sb_secret_test",
    },
    () => {
      assert(typeof serviceClient().from === "function");
      return Promise.resolve();
    },
  );
});

Deno.test("enforceRateLimits lets a caller through when every rule has room", async () => {
  await withStub(
    () => allowance(true),
    async (stub) => {
      await enforceRateLimits(stub.db, RULES);
    },
  );
});

Deno.test(
  "enforceRateLimits consumes every rule, so one cannot be dodged by tripping another",
  async () => {
    // A caller who trips the per-IP budget must still be charged their per-badge
    // one, or the cheaper limit becomes a way to protect the dearer one.
    await withStub(
      () => allowance(false, 30),
      async (stub) => {
        await assertRejects(() => enforceRateLimits(stub.db, RULES), ApiError);

        const consumed = stub.requests.filter((request) =>
          request.table.includes("consume_rate_limit"),
        );
        assertEquals(consumed.length, RULES.length);
      },
    );
  },
);

Deno.test("enforceRateLimits asks for the bucket, limit, and window it was given", async () => {
  await withStub(
    () => allowance(true),
    async (stub) => {
      await enforceRateLimits(stub.db, [RULES[0]]);

      const [request] = stub.requests.filter((r) => r.table.includes("consume_rate_limit"));
      assert(request);
      assertEquals(request.body, {
        p_bucket: "ip:203.0.113.1",
        p_limit: 60,
        p_window_s: 60,
      });
    },
  );
});

Deno.test("enforceRateLimits answers 429 with the longest wait any rule asked for", async () => {
  const waits = [5, 90];
  let call = 0;

  await withStub(
    () => allowance(false, waits[call++] ?? 0),
    async (stub) => {
      const error = await assertRejects(() => enforceRateLimits(stub.db, RULES), ApiError);

      assertEquals(error.status, 429);
      assertEquals(error.topLevel?.retry_after, 90);
    },
  );
});

Deno.test("a rule with room does not cancel out one without", async () => {
  let call = 0;

  await withStub(
    () => (call++ === 0 ? allowance(true) : allowance(false, 20)),
    async (stub) => {
      const error = await assertRejects(() => enforceRateLimits(stub.db, RULES), ApiError);
      assertEquals(error.status, 429);
    },
  );
});

Deno.test("the limiter never fails open, so a database blip cannot lift every limit", async () => {
  await withStub(
    () => ({ body: { message: "connection reset" }, status: 500 }),
    async (stub) => {
      const error = await assertRejects(() => enforceRateLimits(stub.db, RULES), ApiError);

      assertEquals(error.status, 503);
      assert(error.status !== 200, "a failed limiter must not admit the request");
    },
  );
});

Deno.test("audit writes one structured line naming what happened", () => {
  const lines = captureLog(() => {
    audit({
      action: "badge.token.minted",
      actor: "user-1",
      target: "badge-1",
      ip: "203.0.113.1",
    });
  });

  assertEquals(lines.length, 1);
  const entry = JSON.parse(lines[0] ?? "{}");
  assertEquals(entry.audit, "badge.token.minted");
  assertEquals(entry.actor, "user-1");
  assertEquals(entry.target, "badge-1");
  assertEquals(entry.ip, "203.0.113.1");
  assert(typeof entry.at === "string");
});

Deno.test("audit records an unknown address as none, because the word says nothing", () => {
  const lines = captureLog(() => audit({ action: "pairing.claimed", ip: "unknown" }));
  assertEquals(JSON.parse(lines[0] ?? "{}").ip, null);
});

Deno.test("audit fills in what the caller left out", () => {
  const lines = captureLog(() => audit({ action: "pairing.started" }));
  const entry = JSON.parse(lines[0] ?? "{}");

  assertEquals(entry.actor, null);
  assertEquals(entry.target, null);
  assertEquals(entry.ip, null);
  assertEquals(entry.meta, {});
});

Deno.test("audit never throws, so a failed log cannot fail the request it describes", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const errors: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    audit({ action: "pairing.started", meta: circular });
  } finally {
    console.error = realError;
  }

  assert(errors.length > 0, "the failure should be reported, not swallowed in silence");
});

/** Runs a body with console.log captured. */
function captureLog(body: () => void): string[] {
  const lines: string[] = [];
  const real = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    body();
  } finally {
    console.log = real;
  }
  return lines;
}

/** assertThrows, but returning the ApiError so its status can be read. */
function assertThrowsApi(body: () => unknown): ApiError {
  try {
    body();
  } catch (error) {
    assert(error instanceof ApiError, `expected an ApiError, got ${error}`);
    return error;
  }
  throw new Error("expected a throw, and nothing was thrown");
}

Deno.test({
  name: "the sampled prune is housekeeping, and never in the caller's way",
  // The prune is deliberately not awaited, so an in-flight request outliving
  // the test is the behaviour under test rather than a mistake in it. That is
  // the whole point: housekeeping must never hold up the request it rode in on.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Forced to fire. It is deliberately not awaited, so what matters is that
    // the request it decorates still succeeds.
    Math.random = () => 0;
    const stub = stubDb(() => allowance(true));
    try {
      await enforceRateLimits(stub.db, [RULES[0]]);
    } finally {
      Math.random = () => 0.5;
      await stub.close();
    }
  },
});

Deno.test("restores the real source of randomness", () => {
  Math.random = real_random;
  assert(typeof Math.random() === "number");
});
