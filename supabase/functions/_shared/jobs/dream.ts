// The dream job body: one synthesis pass over one space.
//
// A plain async function taking injected clients, so a test runs it with no
// server. Everything it reads and writes about the space goes through the space
// writer. The dream_runs row is the exception, and the only one: it is the job's
// own bookkeeping rather than space content, and it is filtered by run id.

import { ApiError } from '../errors.ts';
import { DEFAULT_BUDGET_MS, StageTimeout, startBudget } from './budget.ts';
import { dreamConnections } from './dream_connections.ts';
import { dreamDigest } from './dream_digest.ts';
import { dreamEntities } from './dream_entities.ts';
import { type DreamOutcome, type DreamRunRecord, NOTHING, type Pass } from './dream_pass.ts';
import { spaceScoped } from './space_writer.ts';
import { type JobDeps, recordUsage } from './types.ts';

export type { DreamOutcome, DreamRunRecord };

export type DreamResult =
  | ({ kind: 'succeeded' } & DreamOutcome)
  | { kind: 'timeout'; stage: string }
  | { kind: 'failed'; detail: string };

function dispatch(pass: Pass): Promise<DreamOutcome> {
  switch (pass.run.kind) {
    case 'entities':
      return dreamEntities(pass);
    case 'digest':
      return dreamDigest(pass);
    case 'connections':
      return dreamConnections(pass);
    default: {
      const unhandled: never = pass.run.kind;
      throw new ApiError(500, 'internal', `unknown dream kind ${String(unhandled)}`);
    }
  }
}

async function updateRun(
  run: DreamRunRecord,
  deps: JobDeps,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await deps.db.from('dream_runs').update(fields).eq('id', run.id);
  // The work either happened or it did not. Losing the bookkeeping write is
  // worth a log rather than an exception that buries what actually went wrong.
  if (error) console.error('the dream run row could not be updated', run.id, error.message);
}

function finish(
  pass: Pass,
  status: 'succeeded' | 'failed' | 'timeout',
  outcome: DreamOutcome,
  error: string | null,
): Promise<void> {
  return updateRun(pass.run, pass.deps, {
    status,
    finished_at: pass.deps.http.now().toISOString(),
    input_document_count: outcome.inputDocumentCount,
    output_document_id: outcome.outputDocumentId,
    error,
  });
}

/** What a person reads on the run row when a dream did not finish. */
function readableDetail(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'the dream run stopped on an unexpected error';
}

export async function runDreamJob(run: DreamRunRecord, deps: JobDeps): Promise<DreamResult> {
  const pass: Pass = {
    run,
    deps,
    db: spaceScoped(deps.db, { orgId: run.org_id, spaceId: run.space_id }),
    budget: startBudget(deps.http, deps.budgetMs ?? DEFAULT_BUDGET_MS),
  };
  await updateRun(run, deps, { status: 'running', started_at: deps.http.now().toISOString() });

  try {
    const outcome = await dispatch(pass);
    await finish(pass, 'succeeded', outcome, null);
    await recordUsage(deps.db, [{ orgId: run.org_id, kind: 'dream_run', quantity: 1 }]);
    return { kind: 'succeeded', ...outcome };
  } catch (err) {
    if (err instanceof StageTimeout) {
      console.error('a dream run ran out of time', run.id, err.message);
      await finish(pass, 'timeout', NOTHING, err.message);
      return { kind: 'timeout', stage: err.stage };
    }
    const detail = readableDetail(err);
    console.error('a dream run failed', run.id, err);
    await finish(pass, 'failed', NOTHING, detail);
    return { kind: 'failed', detail };
  }
}
