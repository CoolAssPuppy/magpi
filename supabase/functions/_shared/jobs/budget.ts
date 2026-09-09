// The wall-clock budget every job body runs under.
//
// Background processing runs on Edge Functions, which have a CPU and wall-clock
// ceiling. That ceiling is not worked around here: a job that runs past it stops
// and says which stage it was in, so a stalled import shows a real error rather
// than a spinner that never resolves. The number itself is measured and written
// into docs/limits.md.

import type { ClockDeps } from '../deps.ts';

/**
 * Comfortably inside the platform ceiling, so the job reports its own timeout
 * rather than being killed mid-write and leaving a job row marked running
 * forever.
 */
export const DEFAULT_BUDGET_MS = 45_000;

/**
 * The message is a clause, lowercase and unpunctuated, because it is written
 * into an error column and joined into a sentence by whoever renders it.
 *
 * It does not name the stage. Every caller already has the stage separately, in
 * ingest_jobs.stage or in the prefix the dream job writes, and repeating it here
 * produced "timed out during synthesize, ran out of time during synthesize".
 * Seconds rather than milliseconds, because a person reads this column.
 */
export class StageTimeout extends Error {
  readonly stage: string;
  readonly elapsedMs: number;

  constructor(stage: string, elapsedMs: number, budgetMs: number) {
    super(
      `ran out of time after ${Math.round(elapsedMs / 1000)}s, ` +
        `past the ${Math.round(budgetMs / 1000)}s budget for one run`,
    );
    this.name = 'StageTimeout';
    this.stage = stage;
    this.elapsedMs = elapsedMs;
  }
}

export interface Budget {
  /** Raises a StageTimeout when the budget is spent. Call before each unit of work. */
  checkpoint(stage: string): void;
  elapsedMs(): number;
  /** Whether the next unit of work would start with the budget already gone. */
  isSpent(): boolean;
}

export function startBudget(deps: ClockDeps, budgetMs: number = DEFAULT_BUDGET_MS): Budget {
  const startedAt = deps.now().getTime();
  const elapsedMs = (): number => deps.now().getTime() - startedAt;

  return {
    elapsedMs,
    isSpent: () => elapsedMs() >= budgetMs,
    checkpoint(stage: string) {
      const elapsed = elapsedMs();
      if (elapsed >= budgetMs) throw new StageTimeout(stage, elapsed, budgetMs);
    },
  };
}
