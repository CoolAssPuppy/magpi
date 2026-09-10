import { assert, assertEquals, assertRejects } from '@std/assert';

import { ApiError } from '../_shared/errors.ts';
import { claimQueuedRow } from '../_shared/jobs/claim.ts';
import { type StubDb, stubDb } from '../_shared/testing/stub_db.ts';
import { startManualRun } from './start.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const RUN = '66666666-6666-4666-8666-666666666666';

const INPUT = { orgId: ORG, spaceId: SPACE, kind: 'digest', triggeredBy: USER } as const;

/** A stub holding one dream_runs row, answering conditional updates the way PostgREST does. */
function withRuns(): StubDb {
  const rows = new Map<string, Record<string, unknown>>();

  return stubDb((request) => {
    if (request.table !== 'dream_runs') return undefined;

    if (request.method === 'POST') {
      const row = { id: RUN, ...(request.body as Record<string, unknown>) };
      rows.set(RUN, row);
      return { body: row };
    }

    if (request.method === 'PATCH') {
      const row = rows.get(RUN);
      if (!row) return { body: null };
      if (request.query.includes('status=eq.queued') && row.status !== 'queued') {
        return { body: null };
      }
      Object.assign(row, request.body as Record<string, unknown>);
      return { body: { id: RUN } };
    }

    return undefined;
  });
}

function inserted(stub: StubDb): Record<string, unknown> {
  const post = stub.requests.find((request) =>
    request.table === 'dream_runs' && request.method === 'POST'
  );
  return (post?.body ?? {}) as Record<string, unknown>;
}

Deno.test('a manual run is created in a state the scheduled drainer cannot claim', async () => {
  const stub = withRuns();
  try {
    const run = await startManualRun(stub.db, INPUT, NOW);

    // dream-worker claims queued rows, so a run about to go inline must not be queued.
    const stolen = await claimQueuedRow(stub.db, 'dream_runs', run.id, {
      status: 'running',
      started_at: NOW.toISOString(),
    });

    assertEquals(stolen, false);
    assertEquals(run.id, RUN);
    assertEquals(run.space_id, SPACE);
    assertEquals(run.kind, 'digest');
  } finally {
    await stub.close();
  }
});

Deno.test('a manual run records when it started, so an interrupted one is retired', async () => {
  const stub = withRuns();
  try {
    await startManualRun(stub.db, INPUT, NOW);

    // The abandoned sweep reads started_at, so a row without one stays running for good.
    const row = inserted(stub);
    assertEquals(row.started_at, NOW.toISOString());
    assertEquals(row.org_id, ORG);
    assertEquals(row.triggered_by, USER);
    assert(row.status !== 'queued');
  } finally {
    await stub.close();
  }
});

Deno.test('a run the database refused is an error the caller can answer', async () => {
  const stub = stubDb((request) =>
    request.table === 'dream_runs' ? { body: { message: 'nope' }, status: 500 } : undefined
  );
  try {
    await assertRejects(() => startManualRun(stub.db, INPUT, NOW), ApiError);
  } finally {
    await stub.close();
  }
});
