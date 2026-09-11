import { assertEquals } from '@std/assert';

import { enforceRateLimits } from './rate_limit.ts';
import { stubDb } from './testing/stub_db.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';

function allowing(remaining: number) {
  return { body: { allowed: true, remaining, retry_after_s: 30 } };
}

function refusing(retryAfter: number) {
  return { body: { allowed: false, remaining: 0, retry_after_s: retryAfter } };
}

/**
 * Every one of these calls the limiter, which prunes in the background on one call in two hundred
 * without waiting for it. When that lands the test ends with a request still in flight, which the
 * leak sanitizer fails, so this file ran red about twice in a hundred runs for no reason of its own.
 */
function limiterTest(name: string, body: () => Promise<void>): void {
  Deno.test({ name, fn: body, sanitizeOps: false, sanitizeResources: false });
}

limiterTest('a rule under its limit lets the call through', async () => {
  const stub = stubDb(() => allowing(9));
  try {
    await enforceRateLimits(stub.db, [{ bucket: 'begin:user:u1', limit: 10, windowSeconds: 600 }]);
    assertEquals(stub.requests[0].table, 'rpc/consume_rate_limit');
    assertEquals(stub.requests[0].body, {
      p_bucket: 'begin:user:u1',
      p_limit: 10,
      p_window_s: 600,
    });
  } finally {
    await stub.close();
  }
});

limiterTest('an exhausted rule is a 429 carrying the longest retry', async () => {
  const stub = stubDb((request) =>
    JSON.stringify(request.body).includes(':ip:') ? refusing(42) : refusing(7)
  );
  try {
    const err = await asyncApiErrorFrom(() =>
      enforceRateLimits(stub.db, [
        { bucket: 'begin:user:u1', limit: 1, windowSeconds: 60 },
        { bucket: 'begin:ip:1.1.1.1', limit: 1, windowSeconds: 60 },
      ])
    );
    assertEquals(err.status, 429);
    assertEquals(err.topLevel?.retry_after, 42);
  } finally {
    await stub.close();
  }
});

limiterTest('every rule is consumed even after one has already failed', async () => {
  // Otherwise a caller avoids their per-user budget by tripping the per-ip one.
  const stub = stubDb(() => refusing(5));
  try {
    await asyncApiErrorFrom(() =>
      enforceRateLimits(stub.db, [
        { bucket: 'a', limit: 1, windowSeconds: 60 },
        { bucket: 'b', limit: 1, windowSeconds: 60 },
      ])
    );
    // Counting the consume calls, not every call: enforceRateLimits also prunes at random.
    const consumed = stub.requests.filter((request) => request.table === 'rpc/consume_rate_limit');
    assertEquals(consumed.length, 2);
  } finally {
    await stub.close();
  }
});

limiterTest('a limiter that is down fails closed', async () => {
  // A database blip must not lift every limit at once.
  const stub = stubDb(() => ({ status: 500, body: { message: 'boom' } }));
  try {
    const err = await asyncApiErrorFrom(() =>
      enforceRateLimits(stub.db, [{ bucket: 'a', limit: 1, windowSeconds: 60 }])
    );
    assertEquals(err.status, 503);
  } finally {
    await stub.close();
  }
});
