import { assert, assertEquals } from '@std/assert';

import { fixedClock } from '../deps.ts';
import type { SourceDeps } from './contract.ts';
import { SourceError } from './contract.ts';
import { asRecord, isoStamp, refreshWithTokenEndpoint, requestJson } from './common.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function deps(answer: () => Response | Promise<Response>): SourceDeps {
  return { fetch: () => Promise.resolve(answer()), now: fixedClock(NOW).now };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OPTIONS = { reconnectMessage: 'reconnect it', failureMessage: 'try again later' };

Deno.test('a defensive read of a non-object answers empty rather than throwing', () => {
  assertEquals(asRecord(null), {});
  assertEquals(asRecord([1, 2]), {});
  assertEquals(asRecord({ a: 1 }), { a: 1 });
});

Deno.test('a refused credential asks for a reconnect', async () => {
  for (const status of [401, 403]) {
    try {
      await requestJson('notion', deps(() => json({}, status)), 'https://x.example', OPTIONS);
      throw new Error(`${status} did not raise`);
    } catch (err) {
      assert(err instanceof SourceError);
      assertEquals(err.needsReconnect, true);
    }
  }
});

Deno.test('a server fault does not ask for a needless reconnect', async () => {
  try {
    await requestJson('notion', deps(() => json({}, 500)), 'https://x.example', OPTIONS);
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
  }
});

Deno.test('a body that is not json reads as an empty answer', async () => {
  const body = await requestJson(
    'notion',
    deps(() => new Response('<html>maintenance</html>', { status: 200 })),
    'https://x.example',
    OPTIONS,
  );
  assertEquals(body, null);
});

Deno.test('a successful refresh carries an expiry measured from the injected clock', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google',
    deps(() => json({ access_token: 'at_2', expires_in: 3600 })),
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );

  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, 'at_2');
  // The provider did not rotate it, so the stored one stands.
  assertEquals(outcome.refreshToken, 'rt_1');
  assertEquals(outcome.expiresAt, '2026-09-09T13:00:00.000Z');
});

Deno.test('a refused refresh is a value, not a thrown error', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google',
    deps(() => json({ error: 'invalid_grant' }, 400)),
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );
  assertEquals(outcome.kind, 'failed');
  if (outcome.kind !== 'failed') return;
  assert(outcome.detail.includes('reconnect'));
});

Deno.test('an unreachable token endpoint is a failure the user can read', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google',
    { fetch: () => Promise.reject(new Error('econnrefused')), now: fixedClock(NOW).now },
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );
  assertEquals(outcome.kind, 'failed');
});

Deno.test('an unparseable timestamp falls back to the injected clock', () => {
  const d = deps(() => json({}));
  assertEquals(isoStamp('not a date', d), NOW.toISOString());
  assertEquals(isoStamp('2026-01-02T03:04:05Z', d), '2026-01-02T03:04:05.000Z');
});
