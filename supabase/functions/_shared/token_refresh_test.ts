import { assert, assertEquals } from '@std/assert';

import type { ConnectionRow } from './connections.ts';
import { encryptProviderToken } from './provider_tokens.ts';
import { refreshIfSpent, resolveCredentials } from './token_refresh.ts';
import { type StubDb, stubDb, type StubRequest } from './testing/stub_db.ts';
import { envSource } from './testing/assertions.ts';
import type { SourceDeps } from './sources/contract.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';
const SPACE = '33333333-3333-4333-8333-333333333333';

const ENV = envSource({
  SB_TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  SB_TOKEN_ENC_KEY_ID: '1',
  SB_GOOGLE_DRIVE_CLIENT_ID: 'google-client',
  SB_GOOGLE_DRIVE_CLIENT_SECRET: 'google-secret',
  SB_NOTION_CLIENT_ID: 'notion-client',
  SB_NOTION_CLIENT_SECRET: 'notion-secret',
});

function providerRow(slug: string) {
  return {
    slug,
    display_name: slug,
    description: '',
    kind: 'oauth',
    auth_url: `https://${slug}.example/authorize`,
    token_url: `https://${slug}.example/token`,
    scopes: [],
    docs_url: null,
    enabled: true,
    position: 0,
    scope_selection_kind: null,
  };
}

async function connection(overrides: Partial<ConnectionRow> = {}): Promise<ConnectionRow> {
  const provider = overrides.provider ?? 'google_drive';
  return {
    id: 'connection-1',
    org_id: '44444444-4444-4444-8444-444444444444',
    space_id: SPACE,
    user_id: USER,
    provider,
    external_account_id: 'account-1',
    access_token_enc: await encryptProviderToken('at_stored', { userId: USER, provider }, ENV),
    refresh_token_enc: await encryptProviderToken('rt_stored', { userId: USER, provider }, ENV),
    scopes: [],
    scope_selection: {
      kind: 'folder',
      available: [{ id: 'folder-1', name: 'Runbooks' }],
      selected: ['folder-1'],
    },
    status: 'active',
    status_detail: null,
    cursor: null,
    // Comfortably in the future, so nothing is renewed unless a test says so.
    token_expires_at: '2026-09-09T23:00:00.000Z',
    last_synced_at: null,
    ...overrides,
  };
}

interface Harness {
  stub: StubDb;
  http: SourceDeps;
  calls: string[];
}

function harness(providerSlug: string, tokenAnswer: () => Response): Harness {
  const calls: string[] = [];
  const stub = stubDb((request: StubRequest) =>
    request.table === 'providers' ? { body: [providerRow(providerSlug)] } : { body: [] }
  );
  return {
    stub,
    calls,
    http: {
      now: () => NOW,
      fetch: (input: string | URL | Request) => {
        calls.push(String(input));
        return Promise.resolve(tokenAnswer());
      },
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function updatesTo(stub: StubDb, table: string): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === table && request.method === 'PATCH')
    .map((request) => request.body as Record<string, unknown>);
}

Deno.test('a token with time left is used as it stands, with no renewal call', async () => {
  const h = harness('google_drive', () => json({}));
  try {
    const outcome = await resolveCredentials(await connection(), {
      db: h.stub.db,
      http: h.http,
      env: ENV,
    });

    assertEquals(outcome.kind, 'ready');
    if (outcome.kind !== 'ready') return;
    assertEquals(outcome.credentials.accessToken, 'at_stored');
    assertEquals(outcome.refreshed, false);
    assertEquals(outcome.credentials.scopeSelection.ids, ['folder-1']);
    assertEquals(h.calls.length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a token with no expiry recorded is used as it stands', async () => {
  const h = harness('google_drive', () => json({}));
  try {
    const outcome = await resolveCredentials(await connection({ token_expires_at: null }), {
      db: h.stub.db,
      http: h.http,
      env: ENV,
    });
    assertEquals(outcome.kind, 'ready');
    assertEquals(h.calls.length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a token inside the skew window is renewed before the work starts', async () => {
  // Sixty seconds left is not enough to finish a sync with.
  const h = harness('google_drive', () => json({ access_token: 'at_fresh', expires_in: 3600 }));
  try {
    const outcome = await resolveCredentials(
      await connection({ token_expires_at: '2026-09-09T12:01:00.000Z' }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(outcome.kind, 'ready');
    if (outcome.kind !== 'ready') return;
    assertEquals(outcome.credentials.accessToken, 'at_fresh');
    assertEquals(outcome.refreshed, true);
    assertEquals(h.calls, ['https://google_drive.example/token']);
  } finally {
    await h.stub.close();
  }
});

Deno.test('an already expired token is renewed', async () => {
  const h = harness('google_drive', () => json({ access_token: 'at_fresh', expires_in: 3600 }));
  try {
    const outcome = await resolveCredentials(
      await connection({ token_expires_at: '2026-09-08T00:00:00.000Z' }),
      { db: h.stub.db, http: h.http, env: ENV },
    );
    assertEquals(outcome.kind, 'ready');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a renewed token is written back encrypted, never in the clear', async () => {
  const h = harness('google_drive', () => json({ access_token: 'at_fresh', expires_in: 3600 }));
  try {
    await resolveCredentials(await connection({ token_expires_at: '2026-09-09T12:00:30.000Z' }), {
      db: h.stub.db,
      http: h.http,
      env: ENV,
    });

    const update = updatesTo(h.stub, 'connections')[0];
    const stored = String(update.access_token_enc);
    assert(stored.startsWith('\\x'));
    assert(!stored.includes('at_fresh'));
    assertEquals(update.status, 'active');
    assertEquals(update.status_detail, null);
    assert(String(update.token_expires_at) > NOW.toISOString());
  } finally {
    await h.stub.close();
  }
});

Deno.test('a refused renewal sets the connection expired with a reason a user can read', async () => {
  const h = harness('google_drive', () => json({ error: 'invalid_grant' }, 400));
  try {
    const outcome = await resolveCredentials(
      await connection({ token_expires_at: '2026-09-09T12:00:30.000Z' }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(outcome.kind, 'expired');
    if (outcome.kind !== 'expired') return;
    assert(outcome.detail.includes('reconnect'));

    const update = updatesTo(h.stub, 'connections')[0];
    assertEquals(update.status, 'expired');
    assertEquals(update.status_detail, outcome.detail);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a spent token with no renewal token is expired rather than retried forever', async () => {
  const h = harness('google_drive', () => json({}));
  try {
    const outcome = await resolveCredentials(
      await connection({
        token_expires_at: '2026-09-09T12:00:30.000Z',
        refresh_token_enc: null,
      }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(outcome.kind, 'expired');
    assertEquals(h.calls.length, 0);
    assertEquals(updatesTo(h.stub, 'connections')[0].status, 'expired');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a connection holding no token at all is expired, not decrypted', async () => {
  const h = harness('google_drive', () => json({}));
  try {
    const outcome = await resolveCredentials(await connection({ access_token_enc: null }), {
      db: h.stub.db,
      http: h.http,
      env: ENV,
    });
    assertEquals(outcome.kind, 'expired');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a provider whose tokens never expire clears the stale expiry and carries on', async () => {
  // Notion issues non-expiring tokens, so its driver answers not_supported.
  const h = harness('notion', () => json({}));
  try {
    const outcome = await resolveCredentials(
      await connection({ provider: 'notion', token_expires_at: '2026-09-09T12:00:30.000Z' }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(outcome.kind, 'ready');
    if (outcome.kind !== 'ready') return;
    assertEquals(outcome.credentials.accessToken, 'at_stored');
    assertEquals(h.calls.length, 0);
    assertEquals(updatesTo(h.stub, 'connections')[0], { token_expires_at: null });
  } finally {
    await h.stub.close();
  }
});

Deno.test('a scope selection the picker has never populated reads as no selection', async () => {
  // The column defaults to {} and a connection in that state still syncs.
  const h = harness('google_drive', () => json({}));
  try {
    const outcome = await resolveCredentials(
      await connection({ scope_selection: {} }),
      { db: h.stub.db, http: h.http, env: ENV },
    );
    assertEquals(outcome.kind, 'ready');
    if (outcome.kind !== 'ready') return;
    assertEquals(outcome.credentials.scopeSelection.ids, []);
  } finally {
    await h.stub.close();
  }
});

/** A ciphertext sealed for another user, so anything that decrypts it throws. */
async function sealedForSomeoneElse(provider = 'google_drive'): Promise<string> {
  return await encryptProviderToken(
    'at_stored',
    { userId: '22222222-2222-4222-8222-222222222222', provider },
    ENV,
  );
}

Deno.test('a connection with time left is reported without its token being read', async () => {
  const h = harness('google_drive', () => json({}));
  try {
    const summary = await refreshIfSpent(
      await connection({ access_token_enc: await sealedForSomeoneElse() }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(summary.kind, 'unspent');
    assertEquals(h.calls.length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a renewed connection carries the provider token, never the stored one', async () => {
  const h = harness('google_drive', () => json({ access_token: 'at_fresh', expires_in: 3600 }));
  try {
    const summary = await refreshIfSpent(
      await connection({
        token_expires_at: '2026-09-09T12:00:30.000Z',
        access_token_enc: await sealedForSomeoneElse(),
      }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(summary.kind, 'refreshed');
    if (summary.kind !== 'refreshed') return;
    assertEquals(summary.accessToken, 'at_fresh');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a provider whose tokens never expire clears the expiry without a decrypt', async () => {
  const h = harness('notion', () => json({}));
  try {
    const summary = await refreshIfSpent(
      await connection({
        provider: 'notion',
        token_expires_at: '2026-09-09T12:00:30.000Z',
        access_token_enc: await sealedForSomeoneElse('notion'),
      }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(summary.kind, 'unspent');
    assertEquals(h.calls.length, 0);
    assertEquals(updatesTo(h.stub, 'connections')[0], { token_expires_at: null });
  } finally {
    await h.stub.close();
  }
});

Deno.test('a refusal is reported to the scheduled pass as a reason, not a token', async () => {
  const h = harness('google_drive', () => json({ error: 'invalid_grant' }, 400));
  try {
    const summary = await refreshIfSpent(
      await connection({
        token_expires_at: '2026-09-09T12:00:30.000Z',
        access_token_enc: await sealedForSomeoneElse(),
      }),
      { db: h.stub.db, http: h.http, env: ENV },
    );

    assertEquals(summary.kind, 'expired');
    if (summary.kind !== 'expired') return;
    assert(summary.detail.includes('reconnect'));
    assertEquals(updatesTo(h.stub, 'connections')[0].status, 'expired');
  } finally {
    await h.stub.close();
  }
});
