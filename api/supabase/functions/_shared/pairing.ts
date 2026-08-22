// The device authorization grant state machine (RFC 8628). Single use,
// hash-only storage, terminal after claim, and the badge token minted on poll
// rather than on approve.

import { ApiError } from "./errors.ts";
import { generateUserCode, randomToken, sha256Bytea } from "./crypto.ts";

export const DEVICE_CODE_TTL_SECONDS = 600;
export const DEFAULT_POLL_INTERVAL_SECONDS = 5;
export const SLOW_DOWN_INCREMENT_SECONDS = 5;

// Locks a user_code so the 31^8 space cannot be walked.
export const MAX_FAILED_LOOKUPS = 5;

export interface DeviceCodeRow {
  id: string;
  user_code: string;
  status: "pending" | "approved" | "claimed" | "expired" | "denied";
  user_id: string | null;
  badge_id: string | null;
  badge_uid: string | null;
  poll_interval_s: number;
  poll_count: number;
  failed_lookups: number;
  last_poll_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface BadgeRow {
  id: string;
  user_id: string;
  badge_uid: string;
}

export interface PairingPort {
  now(): Date;
  insertDeviceCode(row: {
    user_code: string;
    device_code_hash: string;
    badge_uid: string;
    expires_at: string;
    poll_interval_s: number;
  }): Promise<void>;
  findByDeviceCodeHash(hash: string): Promise<DeviceCodeRow | null>;
  findByUserCode(code: string): Promise<DeviceCodeRow | null>;
  updateDeviceCode(id: string, patch: Partial<DeviceCodeRow>): Promise<void>;
  /** Creates or replaces the active badge for a uid, returning the row. */
  upsertBadge(input: { user_id: string; badge_uid: string; token_hash: string }): Promise<BadgeRow>;
  getProfile(userId: string): Promise<{
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null>;
}

function isExpired(row: DeviceCodeRow, now: Date): boolean {
  return new Date(row.expires_at).getTime() <= now.getTime();
}

export interface StartResult {
  user_code: string;
  device_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
}

/**
 * The URL the badge draws as a QR. The code travels in the query string in
 * both shapes, so whatever serves pairingUrl must forward it; dropping it
 * turns every pairing into typing eight characters by hand.
 */
export function buildVerificationUrls(
  userCode: string,
  webBaseUrl: string,
  pairingUrl?: string | null,
): { verification_uri: string; verification_uri_complete: string } {
  const code = encodeURIComponent(userCode);
  if (pairingUrl) {
    const base = pairingUrl.replace(/\/+$/, "");
    const joiner = base.includes("?") ? "&" : "?";
    return {
      verification_uri: base,
      verification_uri_complete: `${base}${joiner}code=${code}`,
    };
  }
  const base = webBaseUrl.replace(/\/+$/, "");
  return {
    verification_uri: `${base}/link`,
    verification_uri_complete: `${base}/link?code=${code}`,
  };
}

export async function startDeviceAuth(
  port: PairingPort,
  input: { badge_uid: string },
  webBaseUrl: string,
  pairingUrl?: string | null,
): Promise<StartResult> {
  const userCode = generateUserCode();
  // Only the hash is stored, so a database read cannot be replayed.
  const deviceCode = randomToken(32);
  const now = port.now();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_SECONDS * 1000);

  await port.insertDeviceCode({
    user_code: userCode,
    device_code_hash: await sha256Bytea(deviceCode),
    badge_uid: input.badge_uid,
    expires_at: expiresAt.toISOString(),
    poll_interval_s: DEFAULT_POLL_INTERVAL_SECONDS,
  });

  return {
    user_code: userCode,
    device_code: deviceCode,
    ...buildVerificationUrls(userCode, webBaseUrl, pairingUrl),
    interval: DEFAULT_POLL_INTERVAL_SECONDS,
    expires_in: DEVICE_CODE_TTL_SECONDS,
  };
}

/**
 * Poll returns only on the transition that produces a credential. Every other
 * outcome, pending included, throws an ApiError, because each maps to a
 * distinct RFC 8628 error code and status.
 */
export interface PollResult {
  kind: "claimed";
  badge_token: string;
  badge_id: string;
  user: { handle: string | null; display_name: string | null; avatar_url: string | null };
}

export async function pollDeviceAuth(
  port: PairingPort,
  input: { device_code: string },
): Promise<PollResult> {
  const now = port.now();
  const row = await port.findByDeviceCodeHash(await sha256Bytea(input.device_code));

  // Unknown and expired are indistinguishable to the caller.
  if (!row) throw new ApiError(400, "expired_token", "device code is not valid");

  // First, so a claimed code cannot mint a second token however often it is
  // replayed.
  if (row.status === "claimed") {
    throw new ApiError(400, "expired_token", "device code has already been used");
  }
  if (row.status === "denied") {
    throw new ApiError(400, "access_denied", "the request was denied");
  }
  if (row.status === "expired" || isExpired(row, now)) {
    if (row.status !== "expired") await port.updateDeviceCode(row.id, { status: "expired" });
    throw new ApiError(400, "expired_token", "device code has expired");
  }

  // Widens the interval (RFC 8628). Before the pending return, so a badge
  // cannot poll in a tight loop.
  if (row.last_poll_at) {
    const elapsed = now.getTime() - new Date(row.last_poll_at).getTime();
    if (elapsed < row.poll_interval_s * 1000) {
      const widened = row.poll_interval_s + SLOW_DOWN_INCREMENT_SECONDS;
      await port.updateDeviceCode(row.id, {
        poll_interval_s: widened,
        poll_count: row.poll_count + 1,
        last_poll_at: now.toISOString(),
      });
      throw new ApiError(429, "slow_down", "polling too quickly", {
        topLevel: { retry_after: widened },
        headers: { "Retry-After": String(widened) },
      });
    }
  }

  if (row.status === "pending") {
    await port.updateDeviceCode(row.id, {
      poll_count: row.poll_count + 1,
      last_poll_at: now.toISOString(),
    });
    throw new ApiError(202, "authorization_pending", "waiting for approval");
  }

  // Minted now rather than at approve time, so the secret never passes
  // through the browser.
  if (!row.user_id || !row.badge_uid) {
    throw new ApiError(500, "internal", "approved row is incomplete");
  }

  const badgeToken = randomToken(32);
  const badge = await port.upsertBadge({
    user_id: row.user_id,
    badge_uid: row.badge_uid,
    token_hash: await sha256Bytea(badgeToken),
  });

  // Terminal in the same step that reveals the token.
  await port.updateDeviceCode(row.id, {
    status: "claimed",
    badge_id: badge.id,
    poll_count: row.poll_count + 1,
    last_poll_at: now.toISOString(),
  });

  const profile = await port.getProfile(row.user_id);
  return {
    kind: "claimed",
    badge_token: badgeToken,
    badge_id: badge.id,
    user: {
      handle: profile?.handle ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
  };
}

export interface ApproveResult {
  badge_uid: string;
  status: "approved" | "denied";
}

export async function approveDeviceAuth(
  port: PairingPort,
  input: { user_code: string; confirm: boolean },
  userId: string,
): Promise<ApproveResult> {
  const now = port.now();
  const row = await port.findByUserCode(input.user_code);

  if (!row) throw new ApiError(404, "invalid_user_code", "that code is not valid");

  // Before anything else, so a locked code cannot be probed for status.
  if (row.failed_lookups >= MAX_FAILED_LOOKUPS) {
    throw new ApiError(
      429,
      "too_many_attempts",
      "that code is locked, restart pairing on the badge",
    );
  }

  if (row.status !== "pending" || isExpired(row, now)) {
    // Counts toward the lockout, otherwise codes can be enumerated freely as
    // long as none is pending.
    await port.updateDeviceCode(row.id, { failed_lookups: row.failed_lookups + 1 });
    throw new ApiError(404, "invalid_user_code", "that code is not valid");
  }

  if (!input.confirm) {
    await port.updateDeviceCode(row.id, { status: "denied" });
    return { badge_uid: row.badge_uid ?? "", status: "denied" };
  }

  // No token is minted here; the badge collects it on its next poll.
  await port.updateDeviceCode(row.id, { status: "approved", user_id: userId });
  return { badge_uid: row.badge_uid ?? "", status: "approved" };
}

/** Shown on the anti-phishing confirm screen, to compare against the badge. */
export function shortBadgeId(badgeUid: string): string {
  return badgeUid.slice(-6).toUpperCase();
}

export interface PreviewResult {
  badge: string;
  expires_in: number;
}

/**
 * Resolves a pending user code to the short badge id. Bounded against
 * enumeration by three things that must all stay: the caller is signed in, a
 * miss counts toward the approve lockout, and a non-pending code is answered
 * identically to an unknown one.
 */
export async function previewDeviceAuth(
  port: PairingPort,
  input: { user_code: string },
): Promise<PreviewResult> {
  const now = port.now();
  const row = await port.findByUserCode(input.user_code);

  if (!row) throw new ApiError(404, "invalid_user_code", "that code is not valid");

  if (row.failed_lookups >= MAX_FAILED_LOOKUPS) {
    throw new ApiError(
      429,
      "too_many_attempts",
      "that code is locked, restart pairing on the badge",
    );
  }

  if (row.status !== "pending" || isExpired(row, now) || !row.badge_uid) {
    await port.updateDeviceCode(row.id, { failed_lookups: row.failed_lookups + 1 });
    throw new ApiError(404, "invalid_user_code", "that code is not valid");
  }

  const expiresIn = Math.max(
    0,
    Math.floor((new Date(row.expires_at).getTime() - now.getTime()) / 1000),
  );
  return { badge: shortBadgeId(row.badge_uid), expires_in: expiresIn };
}
