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
    'google_drive',
    'Google Drive',
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
    'google_drive',
    'Google Drive',
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
    'google_drive',
    'Google Drive',
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

/**
 * The refresh grant and the code exchange are the same request to the same
 * endpoint, so a provider that disagrees about one disagrees about both. These
 * pin the two quirks that matter to a renewal, which the grant used to know
 * nothing about while the broker's own copy knew half of them.
 */

function capturing(payload: unknown, status = 200): SourceDeps & { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  return {
    now: fixedClock(NOW).now,
    fetch: (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return Promise.resolve(json(payload, status));
    },
    calls,
  };
}

const GRANT = {
  refreshToken: 'rt_1',
  clientId: 'id',
  clientSecret: 'secret',
  tokenUrl: 'https://provider.example/token',
};

Deno.test('a provider that refuses credentials in the form is sent them in a header', async () => {
  // Notion answers 401 to a form carrying the secret.
  const http = capturing({ access_token: 'at_2' });
  await refreshWithTokenEndpoint('notion', 'Notion', http, GRANT);

  const headers = new Headers(http.calls[0].headers);
  assertEquals(headers.get('authorization'), `Basic ${btoa('id:secret')}`);
  assert(!String(http.calls[0].body).includes('client_secret'));
});

Deno.test('a provider that sends credentials in the form gets no header', async () => {
  const http = capturing({ access_token: 'at_2' });
  await refreshWithTokenEndpoint('google_drive', 'Google Drive', http, GRANT);

  assertEquals(new Headers(http.calls[0].headers).get('authorization'), null);
  assert(String(http.calls[0].body).includes('client_secret=secret'));
});

Deno.test('a renewed token nested in an envelope is lifted out, not read past', async () => {
  // Slack puts a bot token at the top level and the person's token underneath.
  // Storing the top one renews the connection with a credential that cannot
  // read what the connection was set up to read.
  const outcome = await refreshWithTokenEndpoint(
    'slack',
    'Slack',
    capturing({
      ok: true,
      access_token: 'bot-token',
      authed_user: { access_token: 'user-token', expires_in: 3600 },
    }),
    GRANT,
  );

  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, 'user-token');
});

Deno.test('the log names a provider by its slug and the user by its display name', async () => {
  // status_detail is read by a person and the log line is read by whoever is
  // grepping for a slug. One string cannot be both.
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  let outcome;
  try {
    outcome = await refreshWithTokenEndpoint(
      'google_drive',
      'Google Drive',
      capturing({ error: 'invalid_grant' }, 400),
      GRANT,
    );
  } finally {
    console.error = original;
  }

  assertEquals(logged[0][1], { provider: 'google_drive', status: 400 });
  assertEquals(outcome.kind, 'failed');
  if (outcome.kind !== 'failed') return;
  assert(outcome.detail.includes('Google Drive'));
  assert(!outcome.detail.includes('google_drive'));
});
