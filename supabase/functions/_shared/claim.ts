import { ApiError } from './errors.ts';

/** A parked OAuth token, stored only when the caller's JWT matches the account that started it. */
export interface PendingConnection {
  userId: string;
  provider: string;
  externalAccountId: string | null;
  /** Ciphertext, moved as-is. The AAD binds it to userId, so nothing decrypts here. */
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  returnTo: string | null;
}

export interface ClaimPort {
  /** Consumes the ticket once, whoever asks, and returns what it held or null. */
  consumePending(ticket: string): Promise<PendingConnection | null>;
  storeConnection(pending: PendingConnection): Promise<{ connectionId: string }>;
  /** Synchronous: a log line, and never a reason to fail the claim. */
  audit(entry: {
    action: string;
    actor: string;
    target?: string;
    meta?: Record<string, unknown>;
  }): void;
}

/** Snake case, because this crosses the wire to the web app. */
export interface ClaimResult {
  connection_id: string;
  provider: string;
  return_to: string | null;
}

export async function claimConnection(
  port: ClaimPort,
  userId: string,
  ticket: string,
): Promise<ClaimResult> {
  const pending = await port.consumePending(ticket);

  // Unknown, expired, and already claimed share one answer, so a guessed ticket learns nothing.
  if (!pending) {
    throw new ApiError(410, 'claim_expired', 'that connection attempt has expired');
  }

  if (pending.userId !== userId) {
    // Recorded against the account that would have received the token.
    port.audit({
      action: 'conn.claim_rejected',
      actor: `user:${userId}`,
      target: pending.provider,
      meta: { intended_user: pending.userId, external_account_id: pending.externalAccountId },
    });
    throw new ApiError(403, 'claim_mismatch', 'that connection was started by another account');
  }

  const { connectionId } = await port.storeConnection(pending);

  port.audit({
    action: 'conn.link',
    actor: `user:${pending.userId}`,
    target: pending.provider,
    meta: {
      external_account_id: pending.externalAccountId,
      scopes: pending.scopes,
    },
  });

  return {
    connection_id: connectionId,
    provider: pending.provider,
    return_to: pending.returnTo,
  };
}
