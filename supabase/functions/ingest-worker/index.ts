// POST /ingest-worker. Claims queued ingest jobs and calls runIngestJob for each one.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { claimIngestJobs } from '../_shared/jobs/claim.ts';
import { type IngestResult, runIngestJob } from '../_shared/jobs/ingest.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 5;

serveFunction('ingest-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  // Claims a whole batch in one statement, answering in the error envelope when it cannot.
  const jobs = await claimIngestJobs(deps.db, input.batch ?? DEFAULT_BATCH);

  const results: (IngestResult & { job_id: string })[] = [];
  for (const job of jobs) {
    // One job's failure is recorded on its own row and does not stop the batch.
    results.push({ job_id: job.id, ...(await runIngestJob(job, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
