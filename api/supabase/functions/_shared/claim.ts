import { ApiError } from "./errors.ts";

/**
 * Committing a parked OAuth token to the account that actually earned it.
 *
 * connections-callback runs on an origin with no session cookie, so it can
 * name the account that started a flow but cannot show that the browser
 * finishing it is that account. It parks the token instead. This is where the
 * two are compared, on a request carrying a verified JWT.
 *
 * The comparison is the whole security property. A link handed to someone else
 * completes the provider exchange perfectly well and arrives here as the wrong
 * user, which is the case that must not store anything.
 */
export interface PendingConnection {
  userId: string;
  provider: string;
  externalAccount: string | null;
  /** Ciphertext, moved as-is. The AAD binds it to userId, so nothing decrypts here. */
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  returnTo: string | null;
}

export interface ClaimPort {
  /**
   * Consumes the ticket and returns what it was holding, or null if it is
   * unknown, expired, or already used.
   *
   * Single use regardless of who asked. A mismatched claim must not leave a
   * ticket behind for a second attempt.
   */
  consumePending(ticket: string): Promise<PendingConnection | null>;
  storeConnection(pending: PendingConnection): Promise<void>;
  /** Synchronous: a log line, and never a reason to fail the claim. */
  audit(entry: {
    action: string;
    actor: string;
    target?: string;
    meta?: Record<string, unknown>;
  }): void;
}

export interface ClaimResult {
  provider: string;
  returnTo: string | null;
}

export async function claimConnection(
  port: ClaimPort,
  userId: string,
  ticket: string,
): Promise<ClaimResult> {
  const pending = await port.consumePending(ticket);

  // Unknown, expired, and already claimed are one answer on purpose: telling
  // them apart tells a caller whether a ticket they guessed ever existed.
  if (!pending) {
    throw new ApiError(410, "claim_expired", "that connection attempt has expired");
  }

  if (pending.userId !== userId) {
    // Recorded against the account that would have received the token, since
    // that is the account under attack. The ticket is already consumed and the
    // ciphertext is bound by AAD to pending.userId, so it is unusable here
    // even before it is dropped.
    port.audit({
      action: "conn.claim_rejected",
      actor: `user:${userId}`,
      target: pending.provider,
      meta: { intended_user: pending.userId },
    });
    throw new ApiError(403, "claim_mismatch", "that connection was started by another account");
  }

  await port.storeConnection(pending);

  port.audit({
    action: "conn.link",
    actor: `user:${pending.userId}`,
    target: pending.provider,
    meta: { external_account: pending.externalAccount, scopes: pending.scopes },
  });

  return { provider: pending.provider, returnTo: pending.returnTo };
}
