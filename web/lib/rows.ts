import { z } from "zod";

import { PAGE_SLUGS } from "@/lib/badge-constants";

// There are no generated Database types here, so a select comes back untyped.
// Unknown keys are stripped rather than rejected: adding a column should not
// blank a page that does not use it.

export const providerRowSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  /** What connecting this puts on a badge. Defaulted so an unseeded row
      renders rather than blanking the page. */
  description: z.string().catch(""),
  kind: z.enum(["oauth", "api_key"]),
  scopes: z.array(z.string()),
  docs_url: z.string().nullable().catch(null),
  enabled: z.boolean(),
  position: z.number().int().catch(0),
});
export type ProviderRow = z.infer<typeof providerRowSchema>;

/** The connections_public view. Secret columns are absent by construction. */
export const connectionRowSchema = z.object({
  id: z.string(),
  provider: z.string(),
  external_account: z.string().nullable(),
  scopes: z.array(z.string()),
  status: z.enum(["active", "revoked", "error"]),
  error_message: z.string().nullable().catch(null),
  meta: z.record(z.string(), z.unknown()).catch({}),
  expires_at: z.string().nullable().catch(null),
  created_at: z.string(),
});
export type ConnectionRow = z.infer<typeof connectionRowSchema>;

export const badgeRowSchema = z.object({
  id: z.string(),
  badge_uid: z.string(),
  label: z.string().nullable(),
  fw: z.string().nullable().catch(null),
  sdk: z.string().nullable().catch(null),
  last_seen_at: z.string().nullable(),
  battery_v: z.coerce.number().nullable().catch(null),
  charging: z.boolean().nullable().catch(null),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
});
export type BadgeRow = z.infer<typeof badgeRowSchema>;

export const pageSlugSchema = z.enum(PAGE_SLUGS);
export type PageSlug = z.infer<typeof pageSlugSchema>;

/**
 * `position` is defaulted rather than required so a row written before the
 * column existed still renders. A list of zeroes reads as unordered and is
 * renumbered on the first drag.
 */
export const pageConfigRowSchema = z.object({
  id: z.string(),
  page_slug: pageSlugSchema,
  enabled: z.boolean(),
  position: z.number().int().catch(0),
  settings: z.record(z.string(), z.unknown()).catch({}),
});
export type PageConfigRow = z.infer<typeof pageConfigRowSchema>;

export const pomodoroSettingsRowSchema = z.object({
  work_min: z.number().int(),
  short_min: z.number().int(),
  long_min: z.number().int(),
  sessions: z.number().int(),
  leds: z.boolean(),
});
export type PomodoroSettingsRow = z.infer<typeof pomodoroSettingsRowSchema>;

/**
 * Parse a select result, dropping any row that does not fit. One malformed row
 * must not hide every other row the user came to the page to act on.
 */
export function parseRows<T>(schema: z.ZodType<T>, data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  const rows: T[] = [];
  for (const item of data) {
    const parsed = schema.safeParse(item);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

/** Parse a single row, or null. Used where a query returns at most one. */
export function parseRow<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
