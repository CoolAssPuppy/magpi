// Upstream responses, held long enough that thirty seconds between polls does
// not become thirty seconds between upstream calls.
//
// Thirty seconds is a poll interval, not a rate limit. A badge on a desk all
// day is 2,880 polls, and Google, Vercel and PostHog each have their own
// opinion about that. The TTLs below are per page, because a calendar and a
// monthly insight go stale at very different speeds.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Seconds. Keyed by page slug, so a new page declares its own freshness. */
export const CACHE_TTL_S: Record<string, number> = {
  next_thing: 60,
  day_shape: 60,
  deploys: 30,
  counters: 120,
  one_number: 300,
};

export const DEFAULT_TTL_S = 60;

export function ttlFor(slug: string): number {
  return CACHE_TTL_S[slug] ?? DEFAULT_TTL_S;
}

export interface CacheKey {
  userId: string;
  provider: string;
  cacheKey: string;
}

/**
 * The cached payload, or null when there is none or it has expired.
 *
 * Expiry is checked here rather than trusted to a sweep: a row past its
 * expires_at is stale whether or not anything has deleted it yet.
 */
export async function readCache(
  db: SupabaseClient,
  key: CacheKey,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from("provider_cache")
    .select("payload, expires_at")
    .eq("user_id", key.userId)
    .eq("provider", key.provider)
    .eq("cache_key", key.cacheKey)
    .maybeSingle<{ payload: Record<string, unknown>; expires_at: string }>();

  if (error || !data) return null;
  if (Date.parse(data.expires_at) <= Date.now()) return null;
  return data.payload;
}

export async function writeCache(
  db: SupabaseClient,
  key: CacheKey,
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  // A failed write costs one cached read, never the request. The caller
  // already has the payload it was going to return.
  await db.from("provider_cache").upsert(
    {
      user_id: key.userId,
      provider: key.provider,
      cache_key: key.cacheKey,
      payload,
      expires_at: expiresAt,
    },
    { onConflict: "user_id,provider,cache_key" },
  );
}

/**
 * Read through the cache, calling `load` only on a miss.
 *
 * A load that throws is never cached: an outage held for two minutes is an
 * outage the wearer sees for two minutes after it ended.
 *
 * Every payload is stamped with `cached_at`. A page whose numbers age, such as
 * minutes until a meeting, recomputes against that stamp rather than serving a
 * number that was true a minute ago.
 */
export async function cached(
  db: SupabaseClient,
  key: CacheKey,
  ttlSeconds: number,
  load: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const hit = await readCache(db, key);
  if (hit) return hit;

  const fresh = { ...(await load()), cached_at: Date.now() };
  await writeCache(db, key, fresh, ttlSeconds);
  return fresh;
}
