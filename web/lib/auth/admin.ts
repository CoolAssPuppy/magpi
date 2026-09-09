import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { err, ok, type Result } from '@/lib/result';

/**
 * The one admin check. The admin surface and the billing routes both ask the
 * database rather than trusting the role carried on the session, and both get
 * the same three answers: yes, no, and the question could not be asked.
 *
 * A refused rpc comes back as an error rather than a false. A caller that reads
 * a failed check as a no tells an owner they are not an owner.
 */
export async function isOrgAdmin(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Result<boolean, string>> {
  const { data, error } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (error) return err(error.message);

  return ok(data === true);
}
