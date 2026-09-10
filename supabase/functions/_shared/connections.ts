// Reads and updates connections under the service role. Decryption lives in token_refresh.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';

export type ConnectionStatus = 'active' | 'syncing' | 'error' | 'revoked' | 'expired';

export interface ConnectionRow {
  id: string;
  org_id: string;
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
  'id, org_id, user_id, provider, external_account_id, access_token_enc, refresh_token_enc, scopes, scope_selection, status, status_detail, cursor, token_expires_at, last_synced_at';

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

/** Connections due for an incremental pass, never-synced first, then oldest first. */
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

/** Records what a provider said, so the connections page can tell the user to reconnect. */
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
 * Where each unit of a connection lands, as unit id to space id. A connection is not in a space,
 * so this is the only thing that decides which space a synced document belongs to.
 */
export function routesOf(connection: ConnectionRow): Record<string, string> {
  const routes = (connection.scope_selection as { routes?: unknown }).routes;
  if (routes === null || typeof routes !== 'object' || Array.isArray(routes)) return {};

  const out: Record<string, string> = {};
  for (const [unit, space] of Object.entries(routes as Record<string, unknown>)) {
    if (typeof space === 'string' && space.length > 0) out[unit] = space;
  }
  return out;
}

/** The units a driver is allowed to read, which is exactly the ones with somewhere to land. */
export function routedUnitIds(connection: ConnectionRow): string[] {
  return Object.keys(routesOf(connection));
}

/**
 * The service role bypasses RLS, so an edge function has to re-state the read rule itself. This
 * mirrors `connections_select_visible`: your own connection, or one that routes into a space you
 * are in. A refusal reads as "no such connection", so ids cannot be probed.
 */
export async function requireConnectionAccess(
  db: SupabaseClient,
  userId: string,
  connection: ConnectionRow,
): Promise<void> {
  if (connection.user_id === userId) return;

  const spaceIds = [...new Set(Object.values(routesOf(connection)))];
  if (spaceIds.length === 0) {
    throw new ApiError(404, 'unknown_connection', 'no such connection');
  }

  const { data, error } = await db
    .from('space_members')
    .select('space_id')
    .eq('user_id', userId)
    .in('space_id', spaceIds)
    .limit(1);

  if (error) throw new ApiError(500, 'internal', 'space lookup failed');
  if (!data || data.length === 0) {
    throw new ApiError(404, 'unknown_connection', 'no such connection');
  }
}
