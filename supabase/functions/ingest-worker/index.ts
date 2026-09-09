// POST /ingest-worker. Claims queued ingest jobs and runs each one.
//
// A thin wrapper: it builds the injected clients from the environment, claims
// rows, and calls runIngestJob. Every decision about how a document is imported
// lives in the job body, which has no runtime assumptions and is tested without
// a server.

import { z } from 'zod';

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { type IngestResult, runIngestJob } from '../_shared/jobs/ingest.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 5;

// The rpc returns whole ingest_jobs rows; the job body reads five of the columns.
const claimedJobsSchema = z.array(z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  space_id: z.uuid(),
  document_id: z.uuid(),
  connection_id: z.uuid().nullable(),
}));

serveFunction('ingest-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  // claim_ingest_jobs, not a select: it marks the rows running behind
  // `for update skip locked` in one statement, so two overlapping invocations
  // take different jobs instead of both importing the same document. A plain
  // select and a later update cannot do that, and the scheduler will overlap
  // the moment a batch runs longer than its interval.
  //
  // It also takes back a claim whose worker never came back, putting the row on
  // the queue rather than retiring it, and gives up on one that has spent its
  // three attempts. A sweep here would reach those rows first and settle them
  // the other way, so the reclaim inside the function would never match one.
  const { data, error } = await deps.db.rpc('claim_ingest_jobs', {
    p_limit: input.batch ?? DEFAULT_BATCH,
  });
  if (error) throw error;
  const jobs = claimedJobsSchema.parse(data ?? []);

  const results: (IngestResult & { job_id: string })[] = [];
  for (const job of jobs) {
    // One job's failure is recorded on its own row and must not stop the batch:
    // the next document has nothing to do with this one.
    results.push({ job_id: job.id, ...(await runIngestJob(job, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
