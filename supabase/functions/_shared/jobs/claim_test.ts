import { assert, assertEquals } from '@std/assert';

import { claimConnectionForSync, claimQueuedRow, STALE_CLAIM_MS } from './claim.ts';
import { type StubDb, stubDb } from '../testing/stub_db.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const RUN = '55555555-5555-4555-8555-555555555555';

/** PostgREST answers a filtered update with the rows it matched, or none. */
function matching(rows: unknown[]): StubDb {
  return stubDb(() => ({ body: rows }));
}

Deno.test('a claim that matched a queued row is this caller to run', async () => {
  const stub = matching([{ id: RUN }]);
  try {
    assertEquals(await claimQueuedRow(stub.db, 'dream_runs', RUN, { status: 'running' }), true);
  } finally {
    await stub.close();
  }
});

Deno.test('a claim that matched nothing means somebody else got there first', async () => {
  const stub = matching([]);
  try {
    assertEquals(await claimQueuedRow(stub.db, 'dream_runs', RUN, { status: 'running' }), false);
  } finally {
    await stub.close();
  }
});

Deno.test('the claim asks for the row to still be queued', async () => {
  // Without that filter this is an unguarded update that always succeeds, which
  // is the bug it exists to close.
  const stub = matching([{ id: RUN }]);
  try {
    await claimQueuedRow(stub.db, 'dream_runs', RUN, { status: 'running' });
    const query = stub.requests[0].query;
    assert(query.includes('status=eq.queued'), `claim was unguarded: ${query}`);
    assert(query.includes(`id=eq.${RUN}`));
    assertEquals(stub.requests[0].method, 'PATCH');
  } finally {
    await stub.close();
  }
});

Deno.test('a database fault loses the claim rather than duplicating the work', async () => {
  const stub = stubDb(() => ({ status: 500, body: { message: 'boom' } }));
  try {
    assertEquals(await claimQueuedRow(stub.db, 'dream_runs', RUN, { status: 'running' }), false);
  } finally {
    await stub.close();
  }
});

Deno.test('a connection already syncing is not claimed again', async () => {
  const stub = matching([]);
  try {
    assertEquals(await claimConnectionForSync(stub.db, 'connection-1', NOW), false);
  } finally {
    await stub.close();
  }
});

Deno.test('a connection abandoned by a dead worker can be claimed again', async () => {
  // Otherwise one crash retires a connection permanently, and nothing about the
  // row says why it stopped syncing.
  const stub = matching([{ id: 'connection-1' }]);
  try {
    await claimConnectionForSync(stub.db, 'connection-1', NOW);
    const query = stub.requests[0].query;
    const staleBefore = new Date(NOW.getTime() - STALE_CLAIM_MS).toISOString();
    assert(query.includes('status.neq.syncing'), query);
    assert(query.includes(`updated_at.lt.${staleBefore}`), query);
  } finally {
    await stub.close();
  }
});

Deno.test('the staleness window is longer than any pass the budget allows', () => {
  // A pass that could outlive it would be claimed a second time while running.
  assert(STALE_CLAIM_MS > 60_000);
});
