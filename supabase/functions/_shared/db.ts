// Database access for Edge Functions. Runs as service role, bypasses RLS, authorizes itself.

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

/** Writes a security-relevant event as one structured line in the function log. Never throws. */
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

/** Prunes expired rate-limit windows, OAuth states, and pending connections on 1 call in 200. */
export function maybePrune(db: SupabaseClient): void {
  if (Math.floor(Math.random() * PRUNE_SAMPLE_RATE) !== 0) return;
  void Promise.allSettled([
    db.rpc('prune_rate_limits'),
    db.rpc('prune_oauth_states'),
    db.rpc('prune_pending_connections'),
  ]);
}
