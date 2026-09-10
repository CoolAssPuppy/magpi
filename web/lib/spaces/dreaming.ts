import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { err, ok, type Result } from '@/lib/result';

/** The one write to `spaces.dreaming_enabled`, called by both server actions that toggle it. */
export async function setSpaceDreaming(
  supabase: SupabaseClient<Database>,
  spaceId: string,
  enabled: boolean,
): Promise<Result<undefined, string>> {
  const { error } = await supabase
    .from('spaces')
    .update({ dreaming_enabled: enabled })
    .eq('id', spaceId);

  // RLS answers an invisible space with zero rows, not an error, so a no-op here is expected.
  if (error) return err('Dreaming could not be changed for that space.');
  return ok(undefined);
}
