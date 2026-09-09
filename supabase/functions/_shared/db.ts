// Database access for Edge Functions.
//
// Everything here runs with the service role, which bypasses RLS: these
// functions are the privileged path and enforce their own authorization. Never
// pass a caller-supplied id into a query without first deriving it from a
// verified token or from a row this function already owns.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { coreEnv, denoEnv, type EnvSource } from './env.ts';

export function serviceClient(source: EnvSource = denoEnv): SupabaseClient {
  const env = coreEnv(source);
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
 * A log line rather than a table because the events worth keeping (a claim
 * credited to the wrong account, a token refused) are read after the fact by a
 * human rather than queried by the app. Never throws: an audit failure must not
 * fail the request it describes.
 */
export function audit(entry: AuditEntry): void {
  try {
    console.log(
      JSON.stringify({
        audit: entry.action,
        actor: entry.actor ?? null,
        target: entry.target ?? null,
        // "unknown" is the clientIp fallback and says nothing.
        ip: entry.ip && entry.ip !== 'unknown' ? entry.ip : null,
        meta: entry.meta ?? {},
        at: new Date().toISOString(),
      }),
    );
  } catch (err) {
    console.error('audit line could not be written', entry.action, err);
  }
}

const PRUNE_SAMPLE_RATE = 200;

/**
 * Reclaims expired rate-limit windows, abandoned OAuth states, and tokens parked
 * by a connection nobody came back to claim.
 *
 * Sampled rather than run every call: at 1 in 200 a busy deployment prunes every
 * few seconds and a quiet one still prunes, without adding three deletes to the
 * hot path. pending_connections matters most, because an abandoned flow leaves
 * live provider-token ciphertext and expiry makes a row unusable without making
 * it go away.
 */
export function maybePrune(db: SupabaseClient): void {
  if (Math.floor(Math.random() * PRUNE_SAMPLE_RATE) !== 0) return;
  void Promise.allSettled([
    db.rpc('prune_rate_limits'),
    db.rpc('prune_oauth_states'),
    db.rpc('prune_pending_connections'),
  ]);
}
