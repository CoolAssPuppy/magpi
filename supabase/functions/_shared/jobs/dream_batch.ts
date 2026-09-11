// Claims a page of queued dream runs and runs them together.

import { claimQueuedRow } from './claim.ts';
import type { DreamResult, DreamRunRecord } from './dream.ts';
import type { JobDeps } from './types.ts';

export interface BatchOutcome {
  results: (DreamResult & { run_id: string })[];
  contended: number;
}

/** What the worker hands in: one run to completion. */
export type RunOne = (run: DreamRunRecord, deps: JobDeps) => Promise<DreamResult>;

/**
 * Runs are independent: different spaces, or different kinds within one space, writing different
 * rows. A run spends most of its budget waiting on the model and on Postgres, so running them in
 * sequence made a batch cost the sum of its waits.
 */
export async function runDreamBatch(
  runs: DreamRunRecord[],
  deps: JobDeps,
  runOne: RunOne,
): Promise<BatchOutcome> {
  const settled = await Promise.all(runs.map(async (run) => {
    // A select says the run was queued a moment ago, not that this caller owns it.
    const claimed = await claimQueuedRow(deps.db, 'dream_runs', run.id, {
      status: 'running',
      started_at: deps.http.now().toISOString(),
    });
    if (!claimed) return null;
    return { run_id: run.id, ...(await runOne(run, deps)) };
  }));

  return {
    results: settled.filter((result) => result !== null),
    contended: settled.filter((result) => result === null).length,
  };
}
