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
