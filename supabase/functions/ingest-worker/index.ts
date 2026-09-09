// POST /ingest-worker. Claims queued ingest jobs and runs each one.
//
// A thin wrapper: it builds the injected clients from the environment, claims
// rows, and calls runIngestJob. Every decision about how a document is imported
// lives in the job body, which has no runtime assumptions and is tested without
// a server.

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

  // The claim takes a whole batch in one statement and answers in the error
  // envelope when it cannot, so nothing raw from the database or the parser
  // reaches the scheduler as a bare 500.
  const jobs = await claimIngestJobs(deps.db, input.batch ?? DEFAULT_BATCH);

  const results: (IngestResult & { job_id: string })[] = [];
  for (const job of jobs) {
    // One job's failure is recorded on its own row and must not stop the batch:
    // the next document has nothing to do with this one.
    results.push({ job_id: job.id, ...(await runIngestJob(job, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
