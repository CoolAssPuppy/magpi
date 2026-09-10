import { assertEquals } from '@std/assert';

import type { PendingConnection } from '../_shared/claim.ts';
import { asyncApiErrorFrom } from '../_shared/testing/assertions.ts';
import { type StubDb, stubDb, type StubRequest } from '../_shared/testing/stub_db.ts';
import { storeConnection } from './store.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '55555555-5555-4555-8555-555555555555';

function pending(overrides: Partial<PendingConnection> = {}): PendingConnection {
  return {
    userId: USER,
    provider: 'notion',
    externalAccountId: null,
    accessTokenEnc: 'v1.ciphertext.new',
    refreshTokenEnc: null,
    scopes: [],
    tokenExpiresAt: null,
    returnTo: null,
    ...overrides,
  };
}

/** A database holding one connection, answering only reads whose filter is `matches`. */
function withConnection(matches: string): StubDb {
  return stubDb((request: StubRequest) => {
    if (request.table === 'org_members') return { body: { org_id: ORG } };
    if (request.table === 'connections' && request.method === 'GET') {
      return { body: request.query.includes(matches) ? { id: CONNECTION } : null };
    }
    if (request.table === 'connections' && request.method === 'POST') {
      return { body: { id: 'a-second-connection' } };
    }
    return undefined;
  });
}

function requestsFor(stub: StubDb, table: string, method: string): StubRequest[] {
  return stub.requests.filter((request) => request.table === table && request.method === method);
}

Deno.test('reconnecting a provider that names no account keeps one connection', async () => {
  const stub = withConnection('external_account_id=is.null');

  try {
    const result = await storeConnection(stub.db, pending());

    assertEquals(result.connectionId, CONNECTION);
    // A second row here would carry a live token that nothing ever revokes.
    assertEquals(requestsFor(stub, 'connections', 'POST').length, 0);
    assertEquals(requestsFor(stub, 'connections', 'PATCH').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('reconnecting a named account replaces the token on its connection', async () => {
  const stub = withConnection('external_account_id=eq.T04LUMEN');

  try {
    const result = await storeConnection(
      stub.db,
      pending({ provider: 'slack', externalAccountId: 'T04LUMEN' }),
    );

    assertEquals(result.connectionId, CONNECTION);
    assertEquals(requestsFor(stub, 'connections', 'POST').length, 0);
    assertEquals(
      requestsFor(stub, 'connections', 'PATCH')[0].body,
      {
        org_id: ORG,
        user_id: USER,
        provider: 'slack',
        external_account_id: 'T04LUMEN',
        access_token_enc: 'v1.ciphertext.new',
        refresh_token_enc: null,
        scopes: [],
        token_expires_at: null,
        status: 'active',
        status_detail: null,
      },
    );
  } finally {
    await stub.close();
  }
});

Deno.test('the existing connection is looked up by org, not by space', async () => {
  const stub = withConnection('org_id=eq.' + ORG);

  try {
    const result = await storeConnection(
      stub.db,
      pending({ provider: 'slack', externalAccountId: 'T04LUMEN' }),
    );

    // The same account authorized twice is one connection, whatever it is routed to.
    assertEquals(result.connectionId, CONNECTION);
    const lookup = requestsFor(stub, 'connections', 'GET')[0].query;
    assertEquals(lookup.includes(`org_id=eq.${ORG}`), true);
    assertEquals(lookup.includes('space_id'), false);
    assertEquals(lookup.includes(`user_id=eq.${USER}`), true);
    assertEquals(lookup.includes('provider=eq.slack'), true);
    assertEquals(lookup.includes('external_account_id=eq.T04LUMEN'), true);
  } finally {
    await stub.close();
  }
});

Deno.test('a first connection for an account is filed rather than updated', async () => {
  const stub = withConnection('nothing matches this');

  try {
    const result = await storeConnection(stub.db, pending({ externalAccountId: 'ws-9' }));

    assertEquals(result.connectionId, 'a-second-connection');
    assertEquals(requestsFor(stub, 'connections', 'PATCH').length, 0);
    assertEquals(requestsFor(stub, 'connections', 'POST').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a newly filed connection carries no routing', async () => {
  const stub = withConnection('nothing matches this');

  try {
    await storeConnection(stub.db, pending({ externalAccountId: 'ws-9' }));

    // A route invented here would send documents somewhere the user never chose.
    assertEquals(
      requestsFor(stub, 'connections', 'POST')[0].body,
      {
        org_id: ORG,
        user_id: USER,
        provider: 'notion',
        external_account_id: 'ws-9',
        access_token_enc: 'v1.ciphertext.new',
        refresh_token_enc: null,
        scopes: [],
        token_expires_at: null,
        status: 'active',
        status_detail: null,
      },
    );
  } finally {
    await stub.close();
  }
});

Deno.test('a user who belongs to no org cannot store a connection', async () => {
  const stub = stubDb((request: StubRequest) => {
    if (request.table === 'org_members') return { body: null };
    return undefined;
  });

  try {
    const err = await asyncApiErrorFrom(() => storeConnection(stub.db, pending()));

    assertEquals(err.status, 403);
    assertEquals(err.code, 'no_org');
    assertEquals(requestsFor(stub, 'connections', 'POST').length, 0);
  } finally {
    await stub.close();
  }
});
