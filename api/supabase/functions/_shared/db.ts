// Database access for Edge Functions.
//
// Everything here runs with the service role, which bypasses RLS: these
// functions are the privileged path and enforce their own authorization.
// Never pass a user-supplied id into these helpers without first deriving it
// from a verified token.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, rateLimited } from "./errors.ts";
import { secretKey } from "./env.ts";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = secretKey();
  if (!url || !key) {
    throw new ApiError(500, "misconfigured", "server is not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Deletes expired rate-limit windows, abandoned OAuth states, and provider
 * tokens parked by a connection nobody came back to claim.
 *
 * Sampled rather than run every call: at 1 in 200 a busy deployment prunes
 * every few seconds and a quiet one still prunes, without adding a delete to
 * the hot path. Failure is swallowed because housekeeping must never turn a
 * good request into an error.
 *
 * There is no scheduler in this project, so this is the only thing that
 * reclaims those tables. pending_connections matters most: an abandoned flow
 * leaves live provider-token ciphertext, and expiry makes a row unusable
 * without making it go away.
 */
const PRUNE_SAMPLE_RATE = 200;

function maybePrune(db: SupabaseClient): void {
  if (Math.floor(Math.random() * PRUNE_SAMPLE_RATE) !== 0) return;
  void Promise.allSettled([
    db.rpc("prune_rate_limits"),
    db.rpc("prune_oauth_states"),
    db.rpc("prune_pending_connections"),
  ]).catch(() => {});
}

/**
 * Consumes one unit from each rule and throws a 429 if any is exhausted.
 *
 * All rules are consumed even when an earlier one already failed, so a caller
 * cannot avoid their per-badge budget by tripping the per-IP one first.
 */
export async function enforceRateLimits(db: SupabaseClient, rules: RateLimitRule[]): Promise<void> {
  let worstRetry = 0;

  for (const rule of rules) {
    const { data, error } = await db
      .rpc("consume_rate_limit", {
        p_bucket: rule.bucket,
        p_limit: rule.limit,
        p_window_s: rule.windowSeconds,
      })
      .single<{ allowed: boolean; remaining: number; retry_after_s: number }>();

    // Must not fail open: a database blip would lift every limit at once.
    if (error) throw new ApiError(503, "unavailable", "rate limiter unavailable");
    if (!data.allowed) worstRetry = Math.max(worstRetry, data.retry_after_s);
  }

  maybePrune(db);
  if (worstRetry > 0) throw rateLimited(worstRetry);
}

export interface AuditEntry {
  actor?: string | null;
  action: string;
  target?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Records a security-relevant event as one structured line in the function log.
 *
 * A log line rather than a table because this schema has no audit table, and
 * the events worth keeping (a claim credited to the wrong account, a badge
 * token minted) are read after the fact by a human rather than queried by the
 * app. Never throws: an audit failure must not fail the request it describes.
 */
export function audit(entry: AuditEntry): void {
  try {
    console.log(
      JSON.stringify({
        audit: entry.action,
        actor: entry.actor ?? null,
        target: entry.target ?? null,
        // "unknown" is the clientIp fallback and says nothing.
        ip: entry.ip && entry.ip !== "unknown" ? entry.ip : null,
        meta: entry.meta ?? {},
        at: new Date().toISOString(),
      }),
    );
  } catch (err) {
    console.error("audit line could not be written", entry.action, err);
  }
}
