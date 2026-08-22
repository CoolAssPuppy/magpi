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
import { connectionsClaimSchema, parseBody } from "../_shared/validate.ts";

interface PendingRow {
  user_id: string;
  provider: string;
  external_account: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  return_to: string | null;
}

serveFunction("connections-claim", async (core) => {
  const input = parseBody(connectionsClaimSchema, core.body);
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
      };
    },

    // userId is unchanged by a successful claim, so the AAD the callback
    // encrypted under still holds and the ciphertext moves without decryption.
    async storeConnection(pending: PendingConnection) {
      // Insert, not upsert. A second account of the same kind is a second
      // connection: upserting on (user_id, provider) is what used to make the
      // work Notion overwrite the personal one.
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

  const result = await claimConnection(port, user.id, input.ticket);
  return jsonResponse(result);
});
