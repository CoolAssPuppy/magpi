// Fixed windows in Postgres, not in function memory. Edge Functions are
// serverless: a module-scope counter is per instance and resets on every cold
// start, so N concurrent instances multiply the effective limit by N.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError, rateLimited } from './errors.ts';
import { maybePrune } from './db.ts';

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retry_after_s: number;
}

/**
 * Consumes one unit from each rule and throws a 429 if any is exhausted.
 *
 * Every rule is consumed even when an earlier one already failed, so a caller
 * cannot avoid their per-user budget by tripping the per-IP one first.
 */
export async function enforceRateLimits(
  db: SupabaseClient,
  rules: RateLimitRule[],
): Promise<void> {
  let worstRetry = 0;

  for (const rule of rules) {
    const { data, error } = await db
      .rpc('consume_rate_limit', {
        p_bucket: rule.bucket,
        p_limit: rule.limit,
        p_window_s: rule.windowSeconds,
      })
      .single<ConsumeResult>();

    // Must not fail open: a database blip, or a result that is not the shape
    // the function promises, would otherwise lift every limit at once.
    if (error || typeof data?.allowed !== 'boolean') {
      throw new ApiError(503, 'unavailable', 'rate limiter unavailable');
    }
    if (!data.allowed) worstRetry = Math.max(worstRetry, data.retry_after_s);
  }

  maybePrune(db);
  if (worstRetry > 0) throw rateLimited(worstRetry);
}
