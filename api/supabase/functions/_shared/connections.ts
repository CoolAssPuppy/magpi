// Reading a user's connections for the gateway.
//
// This is the only place a provider secret is decrypted on the read path. The
// website never calls it: the encryption key reaches the edge functions and
// nothing else, because the web app has no reason to hold one.

import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptProviderToken } from "./provider_tokens.ts";
import type { ProviderCredentials } from "./sources/contract.ts";

export interface ConnectionRow {
  provider: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  status: "active" | "revoked" | "error";
  meta: Record<string, unknown> | null;
}

const COLUMNS = "provider, access_token_enc, refresh_token_enc, expires_at, status, meta";

export async function loadConnections(
  db: SupabaseClient,
  userId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await db
    .from("connections")
    .select(COLUMNS)
    .eq("user_id", userId)
    .returns<ConnectionRow[]>();
  if (error || !data) return [];
  return data;
}

/**
 * Which providers can answer right now.
 *
 * A connection in the error state is present but cannot be used, so the page
 * that needs it draws not_connected rather than a stack trace. The connections
 * page is where the wearer is told to reconnect.
 */
export function activeProviders(rows: ConnectionRow[]): Set<string> {
  return new Set(
    rows
      .filter((row) => row.status === "active" && row.access_token_enc)
      .map((row) => row.provider),
  );
}

/**
 * Decrypt one connection's secret.
 *
 * Both credential kinds land here: an api_key provider stores its key in the
 * same column through the same encryption path, so there is one code path
 * rather than two.
 */
export async function credentialsFor(
  rows: ConnectionRow[],
  userId: string,
  provider: string,
): Promise<ProviderCredentials | null> {
  const row = rows.find((candidate) => candidate.provider === provider);
  if (!row?.access_token_enc || row.status !== "active") return null;

  const accessToken = await decryptProviderToken(row.access_token_enc, { userId, provider });
  return { accessToken, meta: row.meta ?? {} };
}

/**
 * Records that a provider refused us, so the connections page can say
 * "reconnect" instead of the badge silently showing an error page forever.
 */
export async function markConnectionError(
  db: SupabaseClient,
  userId: string,
  provider: string,
  message: string,
): Promise<void> {
  await db
    .from("connections")
    .update({ status: "error", error_message: message, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", provider);
}
