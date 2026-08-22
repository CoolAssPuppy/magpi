import { cached, ttlFor } from "../cache.ts";
import { COUNTER_MAX } from "../badge-constants.ts";
import { credentialsFor } from "../connections.ts";
import type { PagePayload } from "../envelope.ts";
import {
  assignedIssues,
  mentions,
  openPages,
  reviewRequests,
  unreadCount,
} from "../sources/index.ts";
import type { Counter, ProviderCredentials } from "../sources/contract.ts";

import type { BuildContext } from "./mod.ts";

export const slug = "counters";
/**
 * Empty on purpose. This page draws whatever the wearer connected, so
 * requiring one provider would hide it from someone who only wanted Linear.
 * Each source below is skipped when its connection is absent.
 */
export const requires: string[] = [];

interface Source {
  provider: string;
  label: string;
  read(
    credentials: ProviderCredentials,
    ctx: BuildContext,
  ): Promise<{ count: number; recent: string | null }>;
}

const SOURCES: Source[] = [
  {
    provider: "google",
    label: "Gmail",
    read: (credentials, ctx) =>
      unreadCount(credentials, ctx.deps, {
        query:
          typeof ctx.settings.gmail_query === "string"
            ? ctx.settings.gmail_query
            : "is:unread in:inbox",
      }),
  },
  { provider: "linear", label: "Linear", read: (c, ctx) => assignedIssues(c, ctx.deps) },
  { provider: "slack", label: "Slack", read: (c, ctx) => mentions(c, ctx.deps) },
  { provider: "github", label: "Reviews", read: (c, ctx) => reviewRequests(c, ctx.deps) },
  {
    provider: "notion",
    label: "Notion",
    read: (c, ctx) => openPages(c, ctx.deps, { databaseId: readDatabaseId(ctx) }),
  },
];

/** Which Notion database to count, when the wearer chose one. */
function readDatabaseId(ctx: BuildContext): string | null {
  const value = ctx.settings.notion_database_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function build(ctx: BuildContext): Promise<PagePayload> {
  const chosen = SOURCES.filter((source) => ctx.connected.has(source.provider)).slice(
    0,
    COUNTER_MAX,
  );
  if (chosen.length === 0) return { slug, state: "not_connected" };

  const previous = await readPrevious(ctx);
  const counters: Counter[] = [];

  for (const source of chosen) {
    const credentials = await credentialsFor(ctx.rows, ctx.userId, source.provider);
    if (!credentials) continue;
    // One source that refused must not take the other three with it. A page
    // built from four providers where one is down is still three numbers.
    try {
      const reading = await cached(
        ctx.db,
        { userId: ctx.userId, provider: source.provider, cacheKey: "counter" },
        ttlFor(slug),
        async () => (await source.read(credentials, ctx)) as unknown as Record<string, unknown>,
      );
      const value = typeof reading.count === "number" ? reading.count : 0;
      counters.push({
        label: source.label,
        value,
        delta: value - (previous[source.label] ?? value),
        recent: typeof reading.recent === "string" ? reading.recent : null,
      });
    } catch {
      counters.push({ label: source.label, value: 0, delta: 0, recent: null });
    }
  }

  if (counters.length === 0) return { slug, state: "empty" };
  await writePrevious(ctx, counters);

  const rising = counters.some((counter) => counter.delta > 0);
  return {
    slug,
    state: "ok",
    data: {
      counters: counters.map((counter) => ({
        label: counter.label,
        value: counter.value,
        delta: counter.delta,
        recent: counter.recent,
      })),
      // How long ago a count last went up, so the badge blinks once rather
      // than blinking on every poll for as long as the mail sits unread.
      changed_age_ms: rising ? 0 : Number.MAX_SAFE_INTEGER,
    },
  };
}

const PREVIOUS_KEY = { provider: "google", cacheKey: "counter_previous" };

/**
 * The last values seen, so a delta is a change rather than a total.
 *
 * Held in provider_cache rather than a column of its own: it is a comparison
 * point with no meaning once it is stale, which is what that table is for.
 */
async function readPrevious(ctx: BuildContext): Promise<Record<string, number>> {
  const { data } = await ctx.db
    .from("provider_cache")
    .select("payload")
    .eq("user_id", ctx.userId)
    .eq("provider", PREVIOUS_KEY.provider)
    .eq("cache_key", PREVIOUS_KEY.cacheKey)
    .maybeSingle<{ payload: Record<string, number> }>();
  return data?.payload ?? {};
}

async function writePrevious(ctx: BuildContext, counters: Counter[]): Promise<void> {
  const payload: Record<string, number> = {};
  for (const counter of counters) payload[counter.label] = counter.value;
  await ctx.db.from("provider_cache").upsert(
    {
      user_id: ctx.userId,
      provider: PREVIOUS_KEY.provider,
      cache_key: PREVIOUS_KEY.cacheKey,
      payload,
      // Long enough to survive a night, so a count that rose overnight still
      // reads as a rise in the morning.
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    { onConflict: "user_id,provider,cache_key" },
  );
}
