import "server-only";

import { PAGE_SLUGS } from "@/lib/badge-constants";
import {
  badgeRowSchema,
  connectionRowSchema,
  pageConfigRowSchema,
  parseRow,
  parseRows,
  pomodoroSettingsRowSchema,
  providerRowSchema,
  type BadgeRow,
  type ConnectionRow,
  type PageConfigRow,
  type PomodoroSettingsRow,
  type ProviderRow,
} from "@/lib/rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Every read a page makes, in one place, parsed through a schema.
 *
 * A select comes back untyped, so parseRows is what stops a surprising row
 * becoming a rendered lie. A row that does not fit is dropped rather than
 * taking the page down with it.
 */

const BADGE_COLUMNS =
  "id, badge_uid, label, fw, sdk, last_seen_at, battery_v, charging, created_at, revoked_at";

export async function listBadges(): Promise<BadgeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("badges")
    .select(BADGE_COLUMNS)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  return parseRows(badgeRowSchema, data);
}

export async function listProviders(): Promise<ProviderRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("slug, display_name, description, kind, scopes, docs_url, enabled, position")
    .order("position", { ascending: true });
  return parseRows(providerRowSchema, data);
}

export async function getProvider(slug: string): Promise<ProviderRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("slug, display_name, description, kind, scopes, docs_url, enabled, position")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  return parseRow(providerRowSchema, data);
}

/** The view, never the table. The secret columns are absent by construction. */
export async function listConnections(): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections_public")
    .select(
      "id, provider, label, external_account, scopes, status, error_message, meta, expires_at, created_at",
    )
    .order("created_at", { ascending: true });
  return parseRows(connectionRowSchema, data);
}

/**
 * Every page the device knows, in the order the wearer chose.
 *
 * A page with no row yet is filled in as off, so the list is always complete:
 * an account that never opened this screen still sees all five.
 */
export async function listPageConfigs(): Promise<PageConfigRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("page_configs")
    .select("id, page_slug, enabled, position, settings")
    .order("position", { ascending: true });
  const saved = parseRows(pageConfigRowSchema, data);

  const bySlug = new Map(saved.map((row) => [row.page_slug, row]));
  const missing = PAGE_SLUGS.filter((slug) => !bySlug.has(slug)).map((slug, index) => ({
    id: `unsaved-${slug}`,
    page_slug: slug,
    enabled: false,
    position: saved.length + index,
    settings: {},
  }));

  return [...saved, ...missing];
}

export async function getPomodoroSettings(): Promise<PomodoroSettingsRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pomodoro_settings")
    .select("work_min, short_min, long_min, sessions, leds")
    .maybeSingle();
  // The same defaults the device carries, so an account that never opened
  // settings still shows what its badge would do.
  return (
    parseRow(pomodoroSettingsRowSchema, data) ?? {
      work_min: 25,
      short_min: 5,
      long_min: 20,
      sessions: 4,
      leds: true,
    }
  );
}

export async function getPollIntervalMs(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("poll_interval_ms")
    .maybeSingle<{ poll_interval_ms: number }>();
  return data?.poll_interval_ms ?? 30000;
}
