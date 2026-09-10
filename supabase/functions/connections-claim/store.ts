// Where a claimed exchange becomes a row in connections: one per provider account per space.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../_shared/errors.ts';
import { requireSpaceMembership } from '../_shared/auth.ts';
import type { PendingConnection } from '../_shared/claim.ts';

/** The connection this account already has here. A null external id needs `is`, not `eq`. */
function findExisting(db: SupabaseClient, pending: PendingConnection) {
  const scoped = db
    .from('connections')
    .select('id')
    .eq('space_id', pending.spaceId)
    .eq('user_id', pending.userId)
    .eq('provider', pending.provider);

  return pending.externalAccountId === null
    ? scoped.is('external_account_id', null).maybeSingle<{ id: string }>()
    : scoped.eq('external_account_id', pending.externalAccountId).maybeSingle<{ id: string }>();
}

// userId is unchanged by a claim, so the callback's AAD holds and the ciphertext moves as-is.
export async function storeConnection(
  db: SupabaseClient,
  pending: PendingConnection,
): Promise<{ connectionId: string }> {
  // A membership can be revoked while a flow is in the air.
  const { orgId } = await requireSpaceMembership(db, pending.userId, pending.spaceId);

  const { data: existing } = await findExisting(db, pending);

  const row = {
    org_id: orgId,
    space_id: pending.spaceId,
    user_id: pending.userId,
    provider: pending.provider,
    external_account_id: pending.externalAccountId,
    access_token_enc: pending.accessTokenEnc,
    refresh_token_enc: pending.refreshTokenEnc,
    scopes: pending.scopes,
    token_expires_at: pending.tokenExpiresAt,
    status: 'active' as const,
    // Cleared on a successful reconnect.
    status_detail: null,
  };

  if (existing) {
    const { error } = await db.from('connections').update(row).eq('id', existing.id);
    if (error) throw new ApiError(500, 'internal', 'the connection could not be updated');
    return { connectionId: existing.id };
  }

  const { data, error } = await db
    .from('connections')
    .insert(row)
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new ApiError(500, 'internal', 'the connection could not be stored');
  return { connectionId: data.id };
}
