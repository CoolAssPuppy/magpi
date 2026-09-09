// Creating the run a person asked for, in the state that says it is already
// taken.
//
// dream-worker drains this table by claiming rows that are `queued`, because a
// select is not a claim and two workers overlapping is the normal case rather
// than the rare one. A row inserted here as `queued` and then run inline is
// visible to that drain for as long as the insert takes to answer, and a cron
// tick landing in that window runs the same synthesis a second time: many
// sequential model calls, two sets of outputs, one row recording one of them.
//
// The insert is the claim. Writing `running` in the statement that creates the
// row leaves no window to lose, which is better than claiming afterwards and
// then having to tell the user their run was taken by something they cannot
// see. started_at is written here rather than left to the job body because the
// abandoned sweep in claim.ts reads it, and a row without one is never retired.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../_shared/errors.ts';
import type { DreamRunRecord } from '../_shared/jobs/dream.ts';

export interface ManualRunInput {
  orgId: string;
  spaceId: string;
  kind: DreamRunRecord['kind'];
  triggeredBy: string;
}

export async function startManualRun(
  db: SupabaseClient,
  input: ManualRunInput,
  now: Date,
): Promise<DreamRunRecord> {
  const { data, error } = await db
    .from('dream_runs')
    .insert({
      org_id: input.orgId,
      space_id: input.spaceId,
      kind: input.kind,
      status: 'running',
      started_at: now.toISOString(),
      triggered_by: input.triggeredBy,
    })
    .select('id, org_id, space_id, kind')
    .single<DreamRunRecord>();

  if (error || !data) throw new ApiError(500, 'internal', 'the run could not be started');
  return data;
}
