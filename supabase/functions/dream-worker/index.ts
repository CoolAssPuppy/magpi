// POST /dream-worker. Runs the queued dream runs.
//
// A run is created elsewhere, by the schedule or by a user pressing the button
// on a space page. This only picks up what is queued and calls the job body.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { type DreamResult, type DreamRunRecord, runDreamJob } from '../_shared/jobs/dream.ts';
import { claimQueuedRow, retireAbandoned } from '../_shared/jobs/claim.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

// Dreaming is the heaviest thing this project does: many sequential model calls
// over a whole space. One run per invocation keeps a single space's failure from
// taking the others with it, and makes the ceiling legible when it is hit.
const DEFAULT_BATCH = 1;

serveFunction('dream-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  // A dream run holds many sequential model calls, so it is the likeliest thing
  // here to be killed part way through. Nothing else would ever move it off
  // running, and the space page would show it working for good.
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

  const results: (DreamResult & { run_id: string })[] = [];
  let contended = 0;
  for (const run of data ?? []) {
    // A select says a run was queued a moment ago, not that this caller owns it.
    // A dream run is many sequential model calls, so two workers taking the same
    // one is the most expensive duplicate this system can produce.
    const claimed = await claimQueuedRow(deps.db, 'dream_runs', run.id, {
      status: 'running',
      started_at: deps.http.now().toISOString(),
    });
    if (!claimed) {
      contended += 1;
      continue;
    }
    results.push({ run_id: run.id, ...(await runDreamJob(run, deps)) });
  }

  return jsonResponse({ claimed: results.length, contended, retired, results });
});
