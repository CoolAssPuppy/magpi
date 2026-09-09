import { assertEquals } from '@std/assert';

import { claimConnection, type ClaimPort, type PendingConnection } from './claim.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SPACE = '33333333-3333-4333-8333-333333333333';

function pending(overrides: Partial<PendingConnection> = {}): PendingConnection {
  return {
    userId: OWNER,
    provider: 'notion',
    spaceId: SPACE,
    externalAccountId: 'workspace-1',
    accessTokenEnc: '\\x0201aabb',
    refreshTokenEnc: null,
    scopes: ['read'],
    tokenExpiresAt: null,
    returnTo: '/connections',
    ...overrides,
  };
}

function port(holding: PendingConnection | null) {
  const stored: PendingConnection[] = [];
  const audits: { action: string; actor: string }[] = [];
  let consumed = 0;

  const claim: ClaimPort = {
    consumePending: () => {
      consumed += 1;
      // Single use, whoever asked.
      return Promise.resolve(consumed === 1 ? holding : null);
    },
    storeConnection: (row) => {
      stored.push(row);
      return Promise.resolve({ connectionId: 'connection-1' });
    },
    audit: (entry) => audits.push({ action: entry.action, actor: entry.actor }),
  };

  return { claim, stored, audits, consumedCount: () => consumed };
}

Deno.test('a claim by the account that started the flow stores the connection', async () => {
  const p = port(pending());
  const result = await claimConnection(p.claim, OWNER, 'ticket');

  assertEquals(result.provider, 'notion');
  assertEquals(result.space_id, SPACE);
  assertEquals(result.return_to, '/connections');
  assertEquals(p.stored.length, 1);
  assertEquals(p.audits[0].action, 'conn.link');
});

Deno.test('a claim by another account stores nothing and is audited', async () => {
  const p = port(pending());
  const err = await asyncApiErrorFrom(() => claimConnection(p.claim, OTHER, 'ticket'));

  assertEquals(err.status, 403);
  assertEquals(err.code, 'claim_mismatch');
  assertEquals(p.stored.length, 0);
  assertEquals(p.audits[0].action, 'conn.claim_rejected');
});

Deno.test('a rejected claim still consumes the ticket', async () => {
  const p = port(pending());
  await asyncApiErrorFrom(() => claimConnection(p.claim, OTHER, 'ticket'));
  const second = await asyncApiErrorFrom(() => claimConnection(p.claim, OWNER, 'ticket'));
  assertEquals(second.code, 'claim_expired');
});

Deno.test('an unknown ticket and an expired one are one answer', async () => {
  const err = await asyncApiErrorFrom(() => claimConnection(port(null).claim, OWNER, 'ticket'));
  assertEquals(err.status, 410);
  assertEquals(err.code, 'claim_expired');
});

Deno.test('the space travels with the ticket, not with the claim', async () => {
  // The caller never names a space here: it was chosen before the redirect.
  const p = port(pending({ spaceId: SPACE }));
  await claimConnection(p.claim, OWNER, 'ticket');
  assertEquals(p.stored[0].spaceId, SPACE);
});
