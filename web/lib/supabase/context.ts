import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';

import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

export type SessionContext = {
  readonly userId: string;
  readonly email: string | null;
  readonly orgId: string;
  readonly role: Database['public']['Enums']['org_role'];
  readonly supabase: SupabaseClient<Database>;
};

/**
 * Resolves the caller and the organization they are acting in.
 *
 * Returns null rather than throwing, because "not signed in" is an ordinary
 * outcome at this boundary and every caller has to answer it anyway.
 *
 * Cached for the length of one request: a layout, a page and an action can each
 * ask, and an admin page render asked three times, which was three round trips
 * to the auth server and three reads of org_members for one answer.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: membership.org_id,
    role: membership.role,
    supabase,
  };
});
