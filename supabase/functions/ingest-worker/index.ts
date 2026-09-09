// POST /ingest-worker. Claims queued ingest jobs and runs each one.
//
// A thin wrapper: it builds the injected clients from the environment, claims
// rows, and calls runIngestJob. Every decision about how a document is imported
// lives in the job body, which has no runtime assumptions and is tested without
// a server.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { type IngestJobRecord, type IngestResult, runIngestJob } from '../_shared/jobs/ingest.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 5;

const JOB_COLUMNS = 'id, org_id, space_id, document_id, connection_id';

serveFunction('ingest-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  const { data, error } = await deps.db
    .from('ingest_jobs')
    .select(JOB_COLUMNS)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(input.batch ?? DEFAULT_BATCH)
    .returns<IngestJobRecord[]>();
  if (error) throw error;

  const results: (IngestResult & { job_id: string })[] = [];
  for (const job of data ?? []) {
    // One job's failure is recorded on its own row and must not stop the batch:
    // the next document has nothing to do with this one.
    results.push({ job_id: job.id, ...(await runIngestJob(job, deps)) });
  }

  return jsonResponse({ claimed: results.length, results });
});
