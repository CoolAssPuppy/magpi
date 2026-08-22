import { assert, assertEquals, assertRejects } from "@std/assert";

import { CACHE_TTL_S, DEFAULT_TTL_S, cached, readCache, ttlFor, writeCache } from "./cache.ts";
import {
  requestsFor,
  stubDb,
  type StubDb,
  type StubReply,
  type StubRequest,
} from "./testing/stub_db.ts";

const KEY = { userId: "user-1", provider: "google", cacheKey: "next_thing" };

/** A row PostgREST would return for a cache hit that has not expired yet. */
function freshRow(payload: Record<string, unknown>, secondsLeft = 60) {
  return [{ payload, expires_at: new Date(Date.now() + secondsLeft * 1000).toISOString() }];
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

Deno.test("each page declares how fast its data goes stale", () => {
  assertEquals(ttlFor("deploys"), CACHE_TTL_S.deploys);
  assertEquals(ttlFor("one_number"), CACHE_TTL_S.one_number);
  assert(ttlFor("deploys") < ttlFor("one_number"), "a deploy ages faster than a monthly insight");
});

Deno.test("a page nobody has given a ttl gets the default rather than none", () => {
  assertEquals(ttlFor("a_page_added_later"), DEFAULT_TTL_S);
});

Deno.test("readCache returns a payload that has not expired", async () => {
  await withStub(
    () => ({ body: freshRow({ title: "Standup" }) }),
    async (stub) => {
      assertEquals(await readCache(stub.db, KEY), { title: "Standup" });
    },
  );
});

Deno.test("readCache scopes the lookup to one user, provider, and key", async () => {
  await withStub(
    () => ({ body: freshRow({}) }),
    async (stub) => {
      await readCache(stub.db, KEY);

      const [request] = requestsFor(stub, "provider_cache");
      assert(request, "no read was made");
      assert(request.query.includes("user_id=eq.user-1"), request.query);
      assert(request.query.includes("provider=eq.google"), request.query);
      assert(request.query.includes("cache_key=eq.next_thing"), request.query);
    },
  );
});

Deno.test("readCache treats an expired row as absent, whether or not it was swept", async () => {
  await withStub(
    () => ({ body: freshRow({ title: "Yesterday" }, -1) }),
    async (stub) => {
      assertEquals(await readCache(stub.db, KEY), null);
    },
  );
});

Deno.test("readCache reports nothing when there is no row", async () => {
  await withStub(
    () => ({ body: [] }),
    async (stub) => {
      assertEquals(await readCache(stub.db, KEY), null);
    },
  );
});

Deno.test("readCache reports nothing when the read failed", async () => {
  await withStub(
    () => ({ body: { message: "boom" }, status: 500 }),
    async (stub) => {
      assertEquals(await readCache(stub.db, KEY), null);
    },
  );
});

Deno.test("writeCache stamps an expiry the ttl ahead", async () => {
  await withStub(
    () => ({}),
    async (stub) => {
      const before = Date.now();
      await writeCache(stub.db, KEY, { title: "Standup" }, 120);

      const [request] = requestsFor(stub, "provider_cache");
      assert(request, "nothing was written");
      const written = request.body;
      assert(written && typeof written === "object" && !Array.isArray(written));

      const row = written as Record<string, unknown>;
      assertEquals(row.user_id, "user-1");
      assertEquals(row.payload, { title: "Standup" });

      const expiresAt = Date.parse(String(row.expires_at));
      assert(expiresAt >= before + 120_000, "expiry is too soon");
      assert(expiresAt <= Date.now() + 120_000, "expiry is too far out");
    },
  );
});

Deno.test("cached calls the loader on a miss and stamps when it ran", async () => {
  await withStub(
    ({ method }) => (method === "GET" ? { body: [] } : {}),
    async (stub) => {
      let loads = 0;
      const payload = await cached(stub.db, KEY, 60, async () => {
        loads += 1;
        return await Promise.resolve({ title: "Standup" });
      });

      assertEquals(loads, 1);
      assertEquals(payload.title, "Standup");
      assert(typeof payload.cached_at === "number", "a page that ages needs to know when this ran");
    },
  );
});

Deno.test("cached skips the loader on a hit", async () => {
  await withStub(
    () => ({ body: freshRow({ title: "From the cache", cached_at: 1 }) }),
    async (stub) => {
      let loads = 0;
      const payload = await cached(stub.db, KEY, 60, async () => {
        loads += 1;
        return await Promise.resolve({ title: "Fresh" });
      });

      assertEquals(loads, 0);
      assertEquals(payload.title, "From the cache");
    },
  );
});

Deno.test("cached never stores a failure, so an outage is not served after it ended", async () => {
  await withStub(
    ({ method }) => (method === "GET" ? { body: [] } : {}),
    async (stub) => {
      await assertRejects(
        () =>
          cached(stub.db, KEY, 60, () => {
            throw new Error("upstream is down");
          }),
        Error,
        "upstream is down",
      );

      const writes = requestsFor(stub, "provider_cache").filter(
        (request) => request.method !== "GET",
      );
      assertEquals(writes, []);
    },
  );
});

Deno.test("a cache write that fails costs a cached read, never the request", async () => {
  await withStub(
    ({ method }) =>
      method === "GET" ? { body: [] } : { body: { message: "read only" }, status: 500 },
    async (stub) => {
      const payload = await cached(stub.db, KEY, 60, () =>
        Promise.resolve({ title: "Standup" }),
      );

      assertEquals(payload.title, "Standup");
    },
  );
});
