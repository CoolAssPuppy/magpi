import { assert, assertEquals } from '@std/assert';

import type { IngestJobRecord, IngestResult } from './ingest.ts';
import { runIngestBatch } from './ingest_batch.ts';
import type { JobDeps } from './types.ts';

const DEPS = {} as JobDeps;

function jobs(count: number): IngestJobRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${index}`,
    org_id: 'org',
    space_id: 'space',
    document_id: `doc-${index}`,
    connection_id: null,
    attempts: 1,
  }));
}

const SUCCEEDED: IngestResult = { kind: 'succeeded', chunkCount: 2 };

/** Counts how many were running at once, which is the whole point of the pool. */
function watcher(result: (job: IngestJobRecord) => IngestResult = () => SUCCEEDED) {
  let running = 0;
  let peak = 0;
  const order: string[] = [];

  return {
    get peak() {
      return peak;
    },
    order,
    run: async (job: IngestJobRecord) => {
      running += 1;
      peak = Math.max(peak, running);
      order.push(job.id);
      // A turn of the event loop, so overlapping work actually overlaps.
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return result(job);
    },
  };
}

Deno.test('every job in the batch runs and comes back', async () => {
  const seen = watcher();

  const results = await runIngestBatch(jobs(20), DEPS, seen.run, 8);

  assertEquals(results.length, 20);
  assertEquals(new Set(results.map((result) => result.job_id)).size, 20);
  assert(results.every((result) => result.kind === 'succeeded'));
});

// The reason for a pool rather than Promise.all: a source that allows a few thousand requests an
// hour does not want twenty-five at once.
Deno.test('no more than the given number are in flight at a time', async () => {
  const seen = watcher();

  await runIngestBatch(jobs(40), DEPS, seen.run, 8);

  assertEquals(seen.peak, 8);
});

Deno.test('a batch smaller than the pool does not sit waiting for workers it does not need', async () => {
  const seen = watcher();

  await runIngestBatch(jobs(3), DEPS, seen.run, 8);

  assertEquals(seen.peak, 3);
});

Deno.test('jobs run together rather than one after another', async () => {
  const seen = watcher();

  const started = Date.now();
  await runIngestBatch(jobs(24), DEPS, seen.run, 8);

  // Twenty-four jobs of a millisecond each, eight at a time, is three rounds rather than
  // twenty-four. The margin is generous; the sequential version cannot fit inside it.
  assert(Date.now() - started < 20, 'the batch took as long as running them in sequence');
});

// Claiming the next job would spend an attempt to be told the same thing.
Deno.test('a provider asking us to slow down stops the batch', async () => {
  const seen = watcher((job) =>
    job.id === 'job-2'
      ? { kind: 'retrying', stage: 'fetch', detail: 'slow down', rateLimited: true }
      : SUCCEEDED
  );

  const results = await runIngestBatch(jobs(40), DEPS, seen.run, 2);

  assert(results.length < 40, 'the batch carried on after being throttled');
  assert(results.some((result) => result.kind === 'retrying'));
});

// An ordinary failure is one document's problem, not the batch's.
Deno.test('a job that failed on its own does not stop the others', async () => {
  const seen = watcher((job) =>
    job.id === 'job-1' ? { kind: 'failed', stage: 'extract', detail: 'unreadable' } : SUCCEEDED
  );

  const results = await runIngestBatch(jobs(10), DEPS, seen.run, 4);

  assertEquals(results.length, 10);
  assertEquals(results.filter((result) => result.kind === 'failed').length, 1);
});

Deno.test('an empty queue asks for nothing and answers with nothing', async () => {
  const seen = watcher();

  assertEquals(await runIngestBatch([], DEPS, seen.run, 8), []);
  assertEquals(seen.order, []);
});
