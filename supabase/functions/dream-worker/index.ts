// POST /dream-worker. Runs the queued dream runs.
//
// A run is created elsewhere, by the schedule or by a user pressing the button
// on a space page. This only picks up what is queued and calls the job body.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { type DreamResult, type DreamRunRecord, runDreamJob } from '../_shared/jobs/dream.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

// Dreaming is the heaviest thing this project does: many sequential model calls
// over a whole space. One run per invocation keeps a single space's failure from
// taking the others with it, and makes the ceiling legible when it is hit.
const DEFAULT_BATCH = 1;

serveFunction('dream-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  const { data, error } = await deps.db
    .from('dream_runs')
    .select('id, org_id, space_id, kind')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(input.batch ?? DEFAULT_BATCH)
    .returns<DreamRunRecord[]>();
  if (error) throw error;

  const results: (DreamResult & { run_id: string })[] = [];
  for (const run of data ?? []) {
    results.push({ run_id: run.id, ...(await runDreamJob(run, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
