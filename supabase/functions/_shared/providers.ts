// The provider registry, read from the `providers` table rather than declared here.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';

export type ProviderKind = 'oauth' | 'api_key';

/** What the connections screen asks the user to pick after the redirect. */
export type ScopeSelectionKind = 'channel' | 'folder' | 'workspace';

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
  scope_selection_kind: ScopeSelectionKind | null;
}

/** An oauth row after its endpoints have been proven present. */
export interface OAuthProviderRecord extends ProviderRecord {
  kind: 'oauth';
  auth_url: string;
  token_url: string;
}

const COLUMNS =
  'slug, display_name, description, kind, auth_url, token_url, scopes, docs_url, enabled, position, scope_selection_kind';

export async function loadProvider(
  db: SupabaseClient,
  slug: string,
): Promise<ProviderRecord | null> {
  const { data, error } = await db
    .from('providers')
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle<ProviderRecord>();
  if (error) throw new ApiError(500, 'internal', 'provider lookup failed');
  return data;
}

/** A missing provider and a disabled one give the same answer. */
export function requireEnabledProvider(record: ProviderRecord | null): ProviderRecord {
  if (!record || !record.enabled) {
    throw new ApiError(404, 'unknown_provider', 'that provider is not available');
  }
  return record;
}

/** Narrows a record to the oauth kind, refusing an api_key provider by name. */
export function requireOAuthProvider(record: ProviderRecord): OAuthProviderRecord {
  if (record.kind !== 'oauth') {
    throw new ApiError(
      400,
      'provider_not_oauth',
      `${record.slug} is connected with an api key, not an authorization flow`,
    );
  }
  if (!record.auth_url || !record.token_url) {
    // providers_oauth_urls_present makes this unreachable, so a row here is a server fault.
    throw new ApiError(500, 'misconfigured', `${record.slug} is missing its oauth endpoints`);
  }
  return { ...record, kind: 'oauth', auth_url: record.auth_url, token_url: record.token_url };
}
