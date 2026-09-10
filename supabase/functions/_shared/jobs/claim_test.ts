import { assert, assertEquals } from '@std/assert';

import {
  ABANDONED_AFTER_MS,
  type AbandonedSweep,
  claimConnectionForSync,
  claimIngestJobs,
  claimQueuedRow,
  retireAbandoned,
  STALE_CLAIM_MS,
} from './claim.ts';
import { asyncApiErrorFrom } from '../testing/assertions.ts';
import { type StubDb, stubDb } from '../testing/stub_db.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const RUN = '55555555-5555-4555-8555-555555555555';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** PostgREST answers a filtered update with the rows it matched, or none. */
function matching(rows: unknown[]): StubDb {
  return stubDb(() => ({ body: rows }));
}

/** The sweep dream-worker passes, the only caller left. */
function dreamSweep(overrides: Partial<AbandonedSweep> = {}): AbandonedSweep {
  return {
    table: 'dream_runs',
    startedColumn: 'started_at',
    finishedColumn: 'finished_at',
    error: 'the run was interrupted and did not finish',
    ...overrides,
  };
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
  // Without that filter this is an unguarded update that always succeeds.
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
  // Otherwise one crash retires a connection permanently.
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

Deno.test('a claim clears the reason the last pass left on the row', async () => {
  // The claim clears status_detail in the same statement that sets the syncing status.
  const stub = matching([{ id: 'connection-1' }]);
  try {
    await claimConnectionForSync(stub.db, 'connection-1', NOW);

    const body = stub.requests[0].body;
    assert(isRecord(body));
    assertEquals(body.status, 'syncing');
    assertEquals(body.status_detail, null);
  } finally {
    await stub.close();
  }
});

Deno.test('the staleness window is longer than any pass the budget allows', () => {
  // A pass that could outlive it would be claimed a second time while running.
  assert(STALE_CLAIM_MS > 60_000);
});

Deno.test('a run left running by a killed isolate is retired, not left spinning', async () => {
  // Only this sweep moves a run whose isolate was killed. ingest_jobs is swept elsewhere.
  const stub = matching([{ id: 'run-1' }, { id: 'run-2' }]);
  try {
    const retired = await retireAbandoned(stub.db, dreamSweep(), NOW);

    assertEquals(retired, 2);
    const request = stub.requests[0];
    assertEquals(request.method, 'PATCH');
    assert(request.query.includes('status=eq.running'), request.query);
    assert(request.query.includes('started_at=lt.'), request.query);
  } finally {
    await stub.close();
  }
});

Deno.test('a retired row says why it stopped and when it was given up on', async () => {
  // The space page needs a reason and a finish time to stop showing a spinner.
  const stub = matching([{ id: 'run-1' }]);
  try {
    await retireAbandoned(stub.db, dreamSweep(), NOW);

    const body = stub.requests[0].body;
    assert(isRecord(body));
    assertEquals(body.status, 'timeout');
    assertEquals(body.error, 'the run was interrupted and did not finish');
    assertEquals(body.finished_at, NOW.toISOString());
  } finally {
    await stub.close();
  }
});

Deno.test('a table with nowhere to record when work stopped is not sent the column', async () => {
  // PostgREST answers an unknown column with a 400.
  const stub = matching([{ id: 'run-1' }]);
  try {
    await retireAbandoned(stub.db, dreamSweep({ finishedColumn: undefined }), NOW);
    const body = stub.requests[0].body;
    assert(isRecord(body));
    assertEquals(body.finished_at, undefined);
  } finally {
    await stub.close();
  }
});

Deno.test('a healthy run is well inside the window it would be retired at', () => {
  assert(ABANDONED_AFTER_MS > 10 * 60_000);
});

Deno.test('a sweep that fails does not stop the batch it runs before', async () => {
  const stub = stubDb(() => ({ status: 500, body: { message: 'boom' } }));
  try {
    assertEquals(await retireAbandoned(stub.db, dreamSweep(), NOW), 0);
  } finally {
    await stub.close();
  }
});

/** One row shaped the way claim_ingest_jobs returns them. */
function claimedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    org_id: '44444444-4444-4444-8444-444444444444',
    space_id: '33333333-3333-4333-8333-333333333333',
    document_id: '77777777-7777-4777-8777-777777777777',
    connection_id: null,
    // The rpc returns whole rows; a worker reading five columns must not care.
    attempts: 1,
    ...overrides,
  };
}

Deno.test('claiming asks the function for a batch and hands back what it took', async () => {
  const stub = stubDb(() => ({ body: [claimedRow()] }));
  try {
    const jobs = await claimIngestJobs(stub.db, 5);

    assertEquals(jobs.length, 1);
    assertEquals(jobs[0].document_id, '77777777-7777-4777-8777-777777777777');
    assertEquals(stub.requests[0].table, 'rpc/claim_ingest_jobs');
    assertEquals(stub.requests[0].body, { p_limit: 5 });
  } finally {
    await stub.close();
  }
});

Deno.test('a queue the database refused answers in the error envelope', async () => {
  // A raw PostgrestError thrown out of a worker leaks the database's own message.
  const stub = stubDb(() => ({ status: 500, body: { message: 'relation does not exist' } }));
  try {
    const err = await asyncApiErrorFrom(() => claimIngestJobs(stub.db, 5));
    assertEquals(err.status, 500);
    assertEquals(err.code, 'internal');
    assert(!err.message.includes('relation'), err.message);
  } finally {
    await stub.close();
  }
});

Deno.test('a claimed row the worker cannot read is an error it can answer with', async () => {
  // A ZodError escaping the handler is the same generic 500 with a stack in it.
  const stub = stubDb(() => ({ body: [claimedRow({ document_id: 'not-a-uuid' })] }));
  try {
    const err = await asyncApiErrorFrom(() => claimIngestJobs(stub.db, 5));
    assertEquals(err.status, 500);
    assertEquals(err.code, 'internal');
  } finally {
    await stub.close();
  }
});
