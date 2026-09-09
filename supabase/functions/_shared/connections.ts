// Reading and updating connections under the service role.
//
// This is the only place a provider secret is decrypted. The encryption key
// reaches the edge functions and nothing else, because the web app has no reason
// to hold one.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';
import { denoEnv, type EnvSource } from './env.ts';
import { decryptProviderToken } from './provider_tokens.ts';

export type ConnectionStatus = 'active' | 'syncing' | 'error' | 'revoked' | 'expired';

export interface ConnectionRow {
  id: string;
  org_id: string;
  space_id: string;
  user_id: string;
  provider: string;
  external_account_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  scopes: string[];
  scope_selection: Record<string, unknown>;
  status: ConnectionStatus;
  status_detail: string | null;
  cursor: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
}

export const CONNECTION_COLUMNS =
  'id, org_id, space_id, user_id, provider, external_account_id, access_token_enc, refresh_token_enc, scopes, scope_selection, status, status_detail, cursor, token_expires_at, last_synced_at';

export async function loadConnection(
  db: SupabaseClient,
  connectionId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from('connections')
    .select(CONNECTION_COLUMNS)
    .eq('id', connectionId)
    .maybeSingle<ConnectionRow>();
  if (error) throw new ApiError(500, 'internal', 'connection lookup failed');
  return data;
}

/**
 * Connections due for an incremental pass, oldest first.
 *
 * Ordered by last_synced_at with nulls first, so a connection that has never
 * synced is picked up before one that ran an hour ago and no connection can be
 * starved by a busier neighbour.
 */
export async function claimableConnections(
  db: SupabaseClient,
  limit: number,
): Promise<ConnectionRow[]> {
  const { data, error } = await db
    .from('connections')
    .select(CONNECTION_COLUMNS)
    .in('status', ['active', 'syncing'])
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)
    .returns<ConnectionRow[]>();
  if (error) throw new ApiError(500, 'internal', 'connection listing failed');
  return data ?? [];
}

/**
 * Records what a provider said, so the connections page can say "reconnect"
 * instead of a sync silently stalling forever.
 */
export async function markConnectionStatus(
  db: SupabaseClient,
  connectionId: string,
  status: ConnectionStatus,
  statusDetail: string | null,
): Promise<void> {
  const { error } = await db
    .from('connections')
    .update({ status, status_detail: statusDetail })
    .eq('id', connectionId);
  if (error) throw new ApiError(500, 'internal', 'connection status update failed');
}

export async function advanceCursor(
  db: SupabaseClient,
  connectionId: string,
  cursor: string | null,
  syncedAt: Date,
): Promise<void> {
  const { error } = await db
    .from('connections')
    .update({
      cursor,
      last_synced_at: syncedAt.toISOString(),
      status: 'active',
      status_detail: null,
    })
    .eq('id', connectionId);
  if (error) throw new ApiError(500, 'internal', 'cursor update failed');
}

/**
 * The plaintext access token for one connection.
 *
 * Callers wanting a token that is definitely still valid go through
 * resolveCredentials in token_refresh.ts instead: this one decrypts what is
 * stored and says nothing about whether the provider still honours it.
 */
export async function decryptAccessToken(
  connection: ConnectionRow,
  source: EnvSource = denoEnv,
): Promise<string> {
  if (!connection.access_token_enc) {
    throw new ApiError(409, 'connection_unusable', 'that connection holds no token');
  }
  return decryptProviderToken(
    connection.access_token_enc,
    { userId: connection.user_id, provider: connection.provider },
    source,
  );
}
