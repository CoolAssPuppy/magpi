// POST /connections-claim
//
// The second half of the OAuth flow, and the reason the first half no longer
// writes anything. connections-callback parked an encrypted provider token
// under the account that started the flow. This decides whether that account
// is the one now asking, and it is the only place an OAuth exchange becomes a
// connection.
//
// The identity comes from a verified JWT via requireUser, so the browser
// holding the session answers, not the state value that started the flow. That
// closes the gap RFC 6749 10.12 describes: a link handed to someone else
// completes the exchange, arrives here as the wrong user, and is discarded.

import { jsonResponse } from "../_shared/errors.ts";
import { serveFunction } from "../_shared/http.ts";
import { audit, enforceRateLimits, serviceClient } from "../_shared/db.ts";
import { requireUser } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { claimConnection, type ClaimPort, type PendingConnection } from "../_shared/claim.ts";
import { connectionsClaimOrKeySchema, parseBody } from "../_shared/validate.ts";
import { encryptProviderToken } from "../_shared/provider_tokens.ts";
import { ApiError } from "../_shared/errors.ts";

interface PendingRow {
  user_id: string;
  provider: string;
  external_account: string | null;
  connection_id: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  return_to: string | null;
}

serveFunction("connections-claim", async (core) => {
  const input = parseBody(connectionsClaimOrKeySchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `connections-claim:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `connections-claim:ip:${core.ip}`, limit: 40, windowSeconds: 600 },
  ]);

  const port: ClaimPort = {
    async consumePending(ticket) {
      // Only the hash reaches the database, so a leaked row cannot be replayed
      // as a ticket. Delete-and-return, so two racing claims cannot both win.
      const { data, error } = await db.rpc("consume_pending_connection", {
        p_ticket_hash: await sha256Hex(ticket),
      });
      if (error) throw new Error(`pending consume failed: ${error.message}`);

      const row = (Array.isArray(data) ? data[0] : null) as PendingRow | null;
      if (!row) return null;

      return {
        userId: row.user_id,
        provider: row.provider,
        externalAccount: row.external_account,
        accessTokenEnc: row.access_token_enc,
        refreshTokenEnc: row.refresh_token_enc,
        scopes: row.scopes ?? [],
        tokenExpiresAt: row.token_expires_at,
        returnTo: row.return_to,
        connectionId: row.connection_id,
      };
    },

    // userId is unchanged by a successful claim, so the AAD the callback
    // encrypted under still holds and the ciphertext moves without decryption.
    async storeConnection(pending: PendingConnection) {
      // Refreshing one account replaces its token; anything else is a new
      // account. Insert was what made a reconnect create a duplicate.
      if (pending.connectionId) {
        const { error: updateError } = await db
          .from("connections")
          .update({
            external_account: pending.externalAccount,
            access_token_enc: pending.accessTokenEnc,
            refresh_token_enc: pending.refreshTokenEnc,
            scopes: pending.scopes,
            expires_at: pending.tokenExpiresAt,
            status: "active",
            // Cleared on a successful reconnect, so a stale failure does not
            // sit on a working connection.
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.connectionId)
          .eq("user_id", pending.userId);
        if (updateError) throw new Error(`connection refresh failed: ${updateError.message}`);
        return;
      }

      const { error } = await db.from("connections").insert({
        user_id: pending.userId,
        provider: pending.provider,
        external_account: pending.externalAccount,
        access_token_enc: pending.accessTokenEnc,
        refresh_token_enc: pending.refreshTokenEnc,
        scopes: pending.scopes,
        expires_at: pending.tokenExpiresAt,
        status: "active",
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`connection insert failed: ${error.message}`);
    },

    audit: (entry) => audit({ ...entry, ip: core.ip }),
  };

  if ("api_key" in input) {
    return jsonResponse(await storeKey(db, user.id, input, core.ip));
  }

  const result = await claimConnection(port, user.id, input.ticket);
  return jsonResponse(result);
});

/**
 * Stores a pasted key as a connection.
 *
 * The key is encrypted here rather than in the website, because the encryption
 * key reaches the edge functions and nothing else. The same AAD binds it to
 * the account and provider as an OAuth token.
 */
async function storeKey(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  input: { provider: string; api_key: string; label?: string; meta?: Record<string, string> },
  ip: string,
) {
  const { data: provider } = await db
    .from("providers")
    .select("slug, kind, enabled")
    .eq("slug", input.provider)
    .maybeSingle<{ slug: string; kind: string; enabled: boolean }>();

  if (!provider || !provider.enabled) {
    throw new ApiError(404, "unknown_provider", "no such provider");
  }
  if (provider.kind !== "api_key") {
    throw new ApiError(400, "wrong_kind", "that provider connects with OAuth");
  }

  const accessTokenEnc = await encryptProviderToken(input.api_key, {
    userId,
    provider: input.provider,
  });

  const { error } = await db.from("connections").insert({
    user_id: userId,
    provider: input.provider,
    label: input.label ?? null,
    access_token_enc: accessTokenEnc,
    meta: input.meta ?? {},
    status: "active",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new ApiError(500, "internal", "could not save that key");

  // The key itself never appears here, only that one was stored.
  audit({ action: "connection.key.stored", actor: userId, target: input.provider, ip });
  return { connected: true, provider: input.provider };
}
