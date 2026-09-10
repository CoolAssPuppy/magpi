import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { err, ok, type Result } from '@/lib/result';

/** The one admin check, asked of the database. A refused rpc is an error, not a false. */
export async function isOrgAdmin(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Result<boolean, string>> {
  const { data, error } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (error) return err(error.message);

  return ok(data === true);
}
