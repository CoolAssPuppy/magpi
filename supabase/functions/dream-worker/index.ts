// POST /dream-worker. Picks up queued dream runs, created elsewhere, and calls the job body.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { type DreamRunRecord, runDreamJob } from '../_shared/jobs/dream.ts';
import { runDreamBatch } from '../_shared/jobs/dream_batch.ts';
import { retireAbandoned } from '../_shared/jobs/claim.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

// A night's runs go together. A failure is recorded on its own row and leaves the others alone.
const DEFAULT_BATCH = 8;

serveFunction('dream-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  // Nothing else moves an interrupted run off `running`, so the space page would show it forever.
  const retired = await retireAbandoned(deps.db, {
    table: 'dream_runs',
    startedColumn: 'started_at',
    finishedColumn: 'finished_at',
    error: 'the run was interrupted and did not finish',
  }, deps.http.now());

  const { data, error } = await deps.db
    .from('dream_runs')
    .select('id, org_id, space_id, kind')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(input.batch ?? DEFAULT_BATCH)
    .returns<DreamRunRecord[]>();
  if (error) throw error;

  const { results, contended } = await runDreamBatch(data ?? [], deps, runDreamJob);

  return jsonResponse({ claimed: results.length, contended, retired, results });
});
