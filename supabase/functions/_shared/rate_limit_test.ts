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

Deno.test('a rule under its limit lets the call through', async () => {
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

Deno.test('an exhausted rule is a 429 carrying the longest retry', async () => {
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

Deno.test('every rule is consumed even after one has already failed', async () => {
  // Otherwise a caller avoids their per-user budget by tripping the per-ip one.
  const stub = stubDb(() => refusing(5));
  try {
    await asyncApiErrorFrom(() =>
      enforceRateLimits(stub.db, [
        { bucket: 'a', limit: 1, windowSeconds: 60 },
        { bucket: 'b', limit: 1, windowSeconds: 60 },
      ])
    );
    assertEquals(stub.requests.length, 2);
  } finally {
    await stub.close();
  }
});

Deno.test('a limiter that is down fails closed', async () => {
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
