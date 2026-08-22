// Every function takes the session user id derived server side, never from the
// client. RLS is the second layer, not the only one.

import { MIN_POLL_MS, PAGE_SLUGS } from "@/lib/badge-constants";

interface DbError {
  message: string;
}

interface FilterBuilder extends PromiseLike<{ error: DbError | null }> {
  eq(column: string, value: string): FilterBuilder;
}

interface QueryBuilder {
  delete(): FilterBuilder;
  insert(values: Record<string, unknown>): PromiseLike<{ error: DbError | null }>;
  update(values: Record<string, unknown>): FilterBuilder;
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict: string },
  ): PromiseLike<{ error: DbError | null }>;
}

export interface DbClient {
  from(table: string): QueryBuilder;
}

export type DbResult = { ok: true } | { ok: false; error: string };

function toResult(error: DbError | null): DbResult {
  return error ? { ok: false, error: error.message } : { ok: true };
}

export const MAX_POLL_MS = 300_000;

/** Enforced here and again by a check constraint, which a direct write cannot skip. */
export function clampPollInterval(value: number): number {
  if (!Number.isFinite(value)) return MIN_POLL_MS;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(value)));
}

export function isKnownPageSlug(slug: string): boolean {
  return (PAGE_SLUGS as readonly string[]).includes(slug);
}

export async function setPageEnabled(
  client: DbClient,
  userId: string,
  pageSlug: string,
  enabled: boolean,
): Promise<DbResult> {
  const { error } = await client
    .from("page_configs")
    .upsert({ user_id: userId, page_slug: pageSlug, enabled }, { onConflict: "user_id,page_slug" });
  return toResult(error);
}

/**
 * Rewrite the whole order in one upsert.
 *
 * Per-row updates would leave a half-applied order visible to a badge that
 * polled between them, and the badge draws whatever it is handed.
 */
export async function setPageOrder(
  client: DbClient,
  userId: string,
  slugs: string[],
): Promise<DbResult> {
  const rows = slugs.map((pageSlug, position) => ({
    user_id: userId,
    page_slug: pageSlug,
    position,
  }));
  const { error } = await client
    .from("page_configs")
    .upsert(rows, { onConflict: "user_id,page_slug" });
  return toResult(error);
}

export async function setPageSettings(
  client: DbClient,
  userId: string,
  pageSlug: string,
  settings: Record<string, unknown>,
): Promise<DbResult> {
  const { error } = await client
    .from("page_configs")
    .upsert(
      { user_id: userId, page_slug: pageSlug, settings },
      { onConflict: "user_id,page_slug" },
    );
  return toResult(error);
}

export interface PomodoroSettings {
  work_min: number;
  short_min: number;
  long_min: number;
  sessions: number;
  leds: boolean;
}

export async function savePomodoroSettings(
  client: DbClient,
  userId: string,
  settings: PomodoroSettings,
): Promise<DbResult> {
  const { error } = await client
    .from("pomodoro_settings")
    .upsert({ user_id: userId, ...settings }, { onConflict: "user_id" });
  return toResult(error);
}

export async function savePollInterval(
  client: DbClient,
  userId: string,
  pollIntervalMs: number,
): Promise<DbResult> {
  const { error } = await client
    .from("profiles")
    .update({ poll_interval_ms: clampPollInterval(pollIntervalMs) })
    .eq("id", userId);
  return toResult(error);
}

export async function relabelBadge(
  client: DbClient,
  userId: string,
  badgeId: string,
  label: string,
): Promise<DbResult> {
  const { error } = await client
    .from("badges")
    .update({ label })
    .eq("id", badgeId)
    .eq("user_id", userId);
  return toResult(error);
}

/** Writes revoked_at only. The badge token dies on its next gateway call. */
export async function revokeBadge(
  client: DbClient,
  userId: string,
  badgeId: string,
): Promise<DbResult> {
  const { error } = await client
    .from("badges")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", badgeId)
    .eq("user_id", userId);
  return toResult(error);
}

export async function disconnectProvider(
  client: DbClient,
  userId: string,
  provider: string,
): Promise<DbResult> {
  const { error } = await client
    .from("connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  return toResult(error);
}
