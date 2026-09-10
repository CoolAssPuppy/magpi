// The wall-clock budget every job body runs under. A job past it stops and names its stage.

import type { ClockDeps } from '../deps.ts';

/** Sits inside the Edge Function ceiling so the job reports its own timeout before it is killed. */
export const DEFAULT_BUDGET_MS = 45_000;

/** Budget-exceeded error. Message is a lowercase clause for an error column, without the stage. */
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
