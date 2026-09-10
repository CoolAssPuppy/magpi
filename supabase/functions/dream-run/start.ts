// The insert is the claim: the row is created `running` with started_at, so no drain can take it.

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
