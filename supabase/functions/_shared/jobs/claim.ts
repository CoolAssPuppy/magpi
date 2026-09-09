// Taking a row nobody else is working on.
//
// Two worker invocations overlap the moment a batch runs longer than its
// interval, which is the normal case here rather than the rare one. A select
// followed by an update is not a claim: both callers see the row queued, both
// update it, and both do the work.
//
// ingest_jobs has claim_ingest_jobs() for this, which takes a whole batch under
// `for update skip locked` in one statement. The other two queues have no such
// function, so they claim one row at a time with a conditional update. It is the
// same guarantee: the update either matched a row in the state it required, in
// which case this caller owns it, or it matched nothing and somebody else got
// there first. Postgres takes a row lock for the duration of that statement, so
// two callers cannot both match.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A connection left `syncing` by a worker that died is invisible to every later
 * pass unless something lets it go. Fifteen minutes is longer than any pass the
 * wall-clock budget permits, so a connection past it is abandoned rather than
 * busy.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * How long a row may sit `running` before it is treated as abandoned.
 *
 * The wall-clock budget is under a minute, so anything past this was not slow,
 * it was interrupted.
 */
export const ABANDONED_AFTER_MS = 15 * 60 * 1000;

export interface AbandonedSweep {
  table: string;
  /** When the row was picked up: claimed_at on a job, started_at on a run. */
  startedColumn: string;
  /** Written alongside the terminal status, which the table requires. */
  error: string;
  /** Set on a table that records when work stopped. */
  finishedColumn?: string;
}

/**
 * Retires rows left `running` by a worker that never came back.
 *
 * The budget in budget.ts catches a job that runs long: it stops, writes
 * `timeout`, and names the stage. It cannot catch a job whose isolate is killed
 * outright, because nothing of ours runs afterwards. That row stays `running`
 * for good, is never reclaimed, and shows the user a spinner that never
 * resolves, which is the one outcome the spec rules out.
 *
 * A sweep on the way into each batch is enough. It costs one statement and the
 * window is wide enough that a healthy run is never caught by it.
 */
export async function retireAbandoned(
  db: SupabaseClient,
  sweep: AbandonedSweep,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS).toISOString();
  const patch: Record<string, unknown> = { status: 'timeout', error: sweep.error };
  if (sweep.finishedColumn) patch[sweep.finishedColumn] = now.toISOString();

  const { data, error } = await db
    .from(sweep.table)
    .update(patch)
    .eq('status', 'running')
    .lt(sweep.startedColumn, cutoff)
    .select('id')
    .returns<{ id: string }[]>();

  // Housekeeping must never fail the batch it runs before.
  if (error) {
    console.error('abandoned sweep failed', sweep.table, error.message);
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Moves one row out of `queued` and reports whether this caller was the one who
 * moved it.
 *
 * The status filter is the whole mechanism. Dropping it turns this back into an
 * unguarded update that always succeeds.
 */
export async function claimQueuedRow(
  db: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle<{ id: string }>();

  // A failed claim is not an error worth stopping a batch for; it is the
  // ordinary answer when another worker was faster.
  if (error) {
    console.error('claim failed', table, id, error.message);
    return false;
  }
  return data !== null;
}

/**
 * Claims a connection for a sync pass.
 *
 * Unlike a job queue, a connection is always eligible: there is no terminal
 * state to leave it in. `syncing` is therefore both the claim and the status the
 * page shows, and the staleness window is what stops a crashed worker retiring a
 * connection permanently.
 */
export async function claimConnectionForSync(
  db: SupabaseClient,
  connectionId: string,
  now: Date,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  const { data, error } = await db
    .from('connections')
    .update({ status: 'syncing' })
    .eq('id', connectionId)
    .or(`status.neq.syncing,updated_at.lt.${staleBefore}`)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error('connection claim failed', connectionId, error.message);
    return false;
  }
  return data !== null;
}
