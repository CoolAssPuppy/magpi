// GET /gateway/desk. The entire badge-facing API.
//
// Authentication is a bearer badge token. Only its sha256 is stored and the
// lookup is by hash, so the table never holds a value that would work if it
// leaked. The same request records what the badge told us about itself.

import type { SupabaseClient } from "@supabase/supabase-js";

import { activeProviders, loadConnections } from "./connections.ts";
import { DEFAULT_POLL_MS, PAGE_SLUGS } from "./badge-constants.ts";
import { buildEnvelope, type DeskEnvelope, type PagePayload } from "./envelope.ts";
import { ApiError } from "./errors.ts";
import { buildPage, type BuildContext } from "./pages/mod.ts";

const POMODORO_COLUMNS = "work_min, short_min, long_min, sessions, leds";

export interface BadgeIdentity {
  id: string;
  userId: string;
}

export interface DeviceReport {
  uid: string | null;
  fw: string | null;
  sdk: string | null;
  batteryV: number | null;
  charging: boolean | null;
}

/** sha256 of the presented token, as the `\x<hex>` form PostgREST accepts. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `\\x${hex}`;
}

/**
 * Resolve a bearer token to a badge, refusing a revoked one.
 *
 * A revoked badge and an unknown token get the same answer. Telling them apart
 * would say whether a token was ever real.
 */
export async function authenticateBadge(db: SupabaseClient, token: string): Promise<BadgeIdentity> {
  const { data, error } = await db
    .from("badges")
    .select("id, user_id, revoked_at")
    .eq("token_hash", await hashToken(token))
    .maybeSingle<{ id: string; user_id: string; revoked_at: string | null }>();

  if (error) throw new ApiError(500, "internal", "badge lookup failed");
  if (!data || data.revoked_at) {
    throw new ApiError(401, "not_paired", "this badge is not paired");
  }
  return { id: data.id, userId: data.user_id };
}

/** Battery, charging state, and firmware, from the query the SDK already sends. */
export function readDeviceReport(url: URL): DeviceReport {
  const number = (name: string): number | null => {
    const raw = url.searchParams.get(name);
    // Blank is not reported, and Number("") is 0. Without this an empty
    // battery_v records the badge as flat rather than as silent.
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const flag = (name: string): boolean | null => {
    const raw = url.searchParams.get(name);
    if (raw === null) return null;
    return raw === "1" || raw === "true";
  };
  return {
    uid: url.searchParams.get("uid"),
    fw: url.searchParams.get("fw"),
    sdk: url.searchParams.get("sdk"),
    batteryV: number("battery_v") ?? number("v"),
    charging: flag("charging") ?? flag("chg"),
  };
}

/**
 * Records that this badge checked in. Best effort: a failed write costs the
 * dashboard a timestamp, never the wearer their screen.
 */
export async function recordCheckIn(
  db: SupabaseClient,
  badgeId: string,
  report: DeviceReport,
): Promise<void> {
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (report.fw !== null) patch.fw = report.fw;
  if (report.sdk !== null) patch.sdk = report.sdk;
  if (report.batteryV !== null) patch.battery_v = report.batteryV;
  if (report.charging !== null) patch.charging = report.charging;
  await db.from("badges").update(patch).eq("id", badgeId);
}

interface PageConfigRow {
  page_slug: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown> | null;
}

async function loadPageConfigs(db: SupabaseClient, userId: string): Promise<PageConfigRow[]> {
  const { data } = await db
    .from("page_configs")
    .select("page_slug, enabled, position, settings")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("position", { ascending: true })
    .returns<PageConfigRow[]>();
  return (data ?? []).filter((row) => (PAGE_SLUGS as readonly string[]).includes(row.page_slug));
}

async function loadPomodoro(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("pomodoro_settings")
    .select(POMODORO_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<{
      work_min: number;
      short_min: number;
      long_min: number;
      sessions: number;
      leds: boolean;
    }>();
  // The device carries the same defaults, so an account that never opened
  // settings still gets a working timer.
  return data ?? { work_min: 25, short_min: 5, long_min: 20, sessions: 4, leds: true };
}

async function loadPollInterval(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db
    .from("profiles")
    .select("poll_interval_ms")
    .eq("id", userId)
    .maybeSingle<{ poll_interval_ms: number }>();
  // buildEnvelope clamps this to the floor, so a row written before the check
  // constraint existed cannot ask for a two second poll.
  return data?.poll_interval_ms ?? DEFAULT_POLL_MS;
}

export interface DeskInput {
  db: SupabaseClient;
  badge: BadgeIdentity;
  fetch: typeof fetch;
  now: Date;
  timeZone: string;
}

/** Everything the badge is told, in one answer. */
export async function buildDesk(input: DeskInput): Promise<DeskEnvelope> {
  const { db, badge, now } = input;

  const [configs, rows, pomodoro, pollIntervalMs] = await Promise.all([
    loadPageConfigs(db, badge.userId),
    loadConnections(db, badge.userId),
    loadPomodoro(db, badge.userId),
    loadPollInterval(db, badge.userId),
  ]);

  const connected = activeProviders(rows);
  const context: Omit<BuildContext, "settings"> = {
    db,
    userId: badge.userId,
    rows,
    connected,
    deps: { fetch: input.fetch, now, timeZone: input.timeZone },
    now,
  };

  // Built in parallel. One slow provider must not add its latency to every
  // other page's, because the badge is waiting on the whole answer.
  const settled = await Promise.all(
    configs.map((config) =>
      buildPage(config.page_slug, { ...context, settings: config.settings ?? {} }),
    ),
  );

  const pages = settled.filter((page): page is PagePayload => page !== null);
  return buildEnvelope({ serverTime: now, pollIntervalMs, pages, pomodoro });
}
