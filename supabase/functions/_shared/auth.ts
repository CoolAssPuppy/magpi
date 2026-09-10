// Caller identity for the authenticated functions, from a token the auth server verifies.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiError, bearerToken } from './errors.ts';
import { coreEnv, denoEnv, type EnvSource, publishableKey } from './env.ts';

export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireUser(
  headers: Headers,
  source: EnvSource = denoEnv,
): Promise<AuthedUser> {
  const token = bearerToken(headers.get('authorization'), 'missing bearer token');

  const client = createClient(coreEnv(source).supabaseUrl, publishableKey(source), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'unauthorized', 'invalid session');

  return { id: data.user.id, email: data.user.email ?? null };
}

/** Membership check for space-scoped writes. Reads space_members directly, as RLS is off here. */
export async function requireSpaceMembership(
  db: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<{ orgId: string }> {
  const { data, error } = await db
    .from('spaces')
    .select('id, org_id, space_members!inner(user_id)')
    .eq('id', spaceId)
    .eq('space_members.user_id', userId)
    .maybeSingle<{ id: string; org_id: string }>();

  if (error) throw new ApiError(500, 'internal', 'space lookup failed');
  // Invisible and nonexistent spaces return the same answer, so ids cannot be probed.
  if (!data) throw new ApiError(404, 'unknown_space', 'no such space');
  return { orgId: data.org_id };
}

/**
 * The caller's org, for writes that belong to an org rather than a space. Reads org_members
 * directly, as RLS is off here. Takes the oldest membership, so a user who belongs to two orgs
 * gets the same one on every call.
 */
export async function requireOrgMembership(
  db: SupabaseClient,
  userId: string,
): Promise<{ orgId: string }> {
  // One organization per user, enforced by org_members_user_id_idx, so there is nothing to choose.
  const { data, error } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle<{ org_id: string }>();

  if (error) throw new ApiError(500, 'internal', 'org lookup failed');
  if (!data) throw new ApiError(403, 'no_org', 'you do not belong to an organization');
  return { orgId: data.org_id };
}
