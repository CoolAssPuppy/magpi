import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { err, ok, type Result } from '@/lib/result';

/**
 * The one write to `spaces.dreaming_enabled`.
 *
 * Two surfaces switch dreaming on and off: the space detail page, where you
 * manage a space, and the dreams page, where you meet the word. Two entry points
 * for one setting is reasonable and each needs its own revalidation path, so
 * they stay two server actions. Two writes to one column is not reasonable, so
 * the write is here and both actions call it.
 */
export async function setSpaceDreaming(
  supabase: SupabaseClient<Database>,
  spaceId: string,
  enabled: boolean,
): Promise<Result<undefined, string>> {
  const { error } = await supabase
    .from('spaces')
    .update({ dreaming_enabled: enabled })
    .eq('id', spaceId);

  // RLS answers a space the caller cannot see with zero rows rather than an
  // error, so a silent no-op here is a permission boundary and not a failure.
  if (error) return err('Dreaming could not be changed for that space.');
  return ok(undefined);
}
