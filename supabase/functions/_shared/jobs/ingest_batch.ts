// Runs a batch of ingest jobs with a bounded number in flight.
//
// One job is a fetch, an embed and a write, which is almost all waiting. Run in sequence, a batch
// costs the sum of its waits. Run all at once, it costs whichever provider is throttled first: a
// source that allows a few thousand requests an hour does not want twenty-five at a time.

import type { IngestJobRecord, IngestResult } from './ingest.ts';
import type { JobDeps } from './types.ts';

/** What the worker hands in: one job to completion. */
export type RunOne = (job: IngestJobRecord, deps: JobDeps) => Promise<IngestResult>;

export type BatchResult = IngestResult & { job_id: string };

/**
 * Enough in flight to hide the waiting, few enough that a provider does not start refusing. Eight
 * against GitHub's five thousand an hour is about one request every two seconds per worker, which
 * is a pace it tolerates.
 */
export const DEFAULT_CONCURRENCY = 8;

export async function runIngestBatch(
  jobs: IngestJobRecord[],
  deps: JobDeps,
  runOne: RunOne,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  let next = 0;
  // Set by the first job a provider throttles. The rest stay queued rather than being claimed,
  // spending an attempt and being told the same thing.
  let throttled = false;

  async function pull(): Promise<void> {
    while (next < jobs.length && !throttled) {
      const job = jobs[next++];
      const result = await runOne(job, deps);
      results.push({ job_id: job.id, ...result });
      if (result.kind === 'retrying' && result.rateLimited) throttled = true;
    }
  }

  const workers = Math.max(1, Math.min(concurrency, jobs.length));
  await Promise.all(Array.from({ length: workers }, () => pull()));
  return results;
}
