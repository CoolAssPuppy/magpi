// The provider registry, read from the `providers` table rather than declared
// here. Adding a provider is a migration, so disabling one or changing its
// scopes takes effect without a deploy.
//
// Two credential kinds share one storage path. An `oauth` provider carries an
// authorize and a token endpoint; an `api_key` provider carries neither and
// never reaches oauth.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors.ts";

export type ProviderKind = "oauth" | "api_key";

export interface ProviderRecord {
  slug: string;
  display_name: string;
  description: string;
  kind: ProviderKind;
  auth_url: string | null;
  token_url: string | null;
  scopes: string[];
  docs_url: string | null;
  enabled: boolean;
  position: number;
}

/** An oauth row after its endpoints have been proven present. */
export interface OAuthProviderRecord extends ProviderRecord {
  kind: "oauth";
  auth_url: string;
  token_url: string;
}

const COLUMNS =
  "slug, display_name, description, kind, auth_url, token_url, scopes, docs_url, enabled, position";

export async function loadProvider(
  db: SupabaseClient,
  slug: string,
): Promise<ProviderRecord | null> {
  const { data, error } = await db
    .from("providers")
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle<ProviderRecord>();
  if (error) throw new ApiError(500, "internal", "provider lookup failed");
  return data;
}

/**
 * A missing provider and a disabled one are one answer, so the registry cannot
 * be walked for slugs that exist but are switched off.
 */
export function requireEnabledProvider(record: ProviderRecord | null): ProviderRecord {
  if (!record || !record.enabled) {
    throw new ApiError(404, "unknown_provider", "that provider is not available");
  }
  return record;
}

/**
 * Narrows a record to the oauth kind, refusing an api_key provider by name.
 *
 * An api_key provider has no authorize page to send anyone to. Without this
 * check the flow would build a URL from two nulls and the user would land on
 * "undefined" with no idea why.
 */
export function requireOAuthProvider(record: ProviderRecord): OAuthProviderRecord {
  if (record.kind !== "oauth") {
    throw new ApiError(
      400,
      "provider_not_oauth",
      `${record.slug} is connected with an api key, not an authorization flow`,
    );
  }
  if (!record.auth_url || !record.token_url) {
    // The providers_oauth_urls_present constraint should make this
    // unreachable; a row that got here anyway is a server fault, not a
    // caller's.
    throw new ApiError(500, "misconfigured", `${record.slug} is missing its oauth endpoints`);
  }
  return { ...record, kind: "oauth", auth_url: record.auth_url, token_url: record.token_url };
}

/**
 * Non-secret configuration a provider needs, stored in `connections.meta`.
 *
 * An allowlist per provider, because meta is caller-supplied and ends up in a
 * request URL. A provider absent from this map accepts no meta at all.
 */
export const PROVIDER_META_FIELDS: Record<string, readonly string[]> = {
  posthog: ["host", "project_id", "insight_id"],
  vercel: ["team_id", "project_id"],
};

const META_VALUE_MAX = 256;

/**
 * Validates a meta object against the provider's allowlist.
 *
 * Unknown keys are rejected rather than dropped, so a caller cannot believe
 * they configured something that was quietly discarded.
 */
export function parseProviderMeta(slug: string, raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "invalid_request", "meta must be an object");
  }

  // Object.hasOwn, not a bare index: "constructor" would otherwise resolve to
  // a function off the prototype and be treated as a field list.
  const allowed = Object.hasOwn(PROVIDER_META_FIELDS, slug) ? PROVIDER_META_FIELDS[slug] : [];
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.includes(key)) {
      throw new ApiError(400, "invalid_request", `${slug} takes no meta field named ${key}`);
    }
    if (typeof value !== "string" || value.length === 0 || value.length > META_VALUE_MAX) {
      throw new ApiError(
        400,
        "invalid_request",
        `meta.${key} must be a string of 1 to ${META_VALUE_MAX} characters`,
      );
    }
    out[key] = value;
  }

  return out;
}
