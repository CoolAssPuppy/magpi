import type { Json, Tables } from '@/lib/database.types';

import { describeScopeSelection, parseScopeSelection } from './scope-selection';
import { describeConnectionStatus, formatLastSynced, type ConnectionStatusView } from './status';

export type ProviderRecord = Pick<
  Tables<'providers'>,
  | 'slug'
  | 'display_name'
  | 'description'
  | 'docs_url'
  | 'enabled'
  | 'position'
  | 'scope_selection_kind'
>;

export type ConnectionRecord = Pick<
  Tables<'connections'>,
  | 'id'
  | 'provider'
  | 'space_id'
  | 'external_account_id'
  | 'status'
  | 'status_detail'
  | 'last_synced_at'
> & { readonly scope_selection: Json };

export type SpaceRecord = Pick<Tables<'spaces'>, 'id' | 'name' | 'kind'>;

export type ConnectionSummary = {
  readonly id: string;
  readonly provider: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly account: string;
  readonly scope: string;
  readonly lastSynced: string;
  readonly status: ConnectionStatusView;
};

export type ProviderListing = {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly scopeSelectionKind: string | null;
  readonly connections: readonly ConnectionSummary[];
};

function summarizeScope(scopeSelection: Json): string {
  const parsed = parseScopeSelection(scopeSelection);
  return parsed.ok ? describeScopeSelection(parsed.data) : 'Scope could not be read';
}

function toSummary(connection: ConnectionRecord, spaceName: string, now: Date): ConnectionSummary {
  return {
    id: connection.id,
    provider: connection.provider,
    spaceId: connection.space_id,
    spaceName,
    account: connection.external_account_id ?? 'Account not recorded',
    scope: summarizeScope(connection.scope_selection),
    lastSynced: formatLastSynced(connection.last_synced_at, now),
    status: describeConnectionStatus({
      status: connection.status,
      statusDetail: connection.status_detail,
      lastSyncedAt: connection.last_synced_at,
    }),
  };
}

/**
 * Providers are rows, so this is the whole connections page: every enabled
 * provider, plus any provider the caller already has a connection to even after
 * it was turned off, so that connection is never stranded off the page.
 */
export function buildProviderListings({
  providers,
  connections,
  spaces,
  now,
}: {
  readonly providers: readonly ProviderRecord[];
  readonly connections: readonly ConnectionRecord[];
  readonly spaces: readonly SpaceRecord[];
  readonly now: Date;
}): readonly ProviderListing[] {
  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));
  const connectedProviders = new Set(connections.map((connection) => connection.provider));

  return providers
    .filter((provider) => provider.enabled || connectedProviders.has(provider.slug))
    .slice()
    .sort((a, b) => a.position - b.position || a.display_name.localeCompare(b.display_name))
    .map((provider) => ({
      slug: provider.slug,
      displayName: provider.display_name,
      description: provider.description,
      docsUrl: provider.docs_url,
      scopeSelectionKind: provider.scope_selection_kind,
      connections: connections
        .filter((connection) => connection.provider === provider.slug)
        // RLS already guarantees a visible connection has a visible space, so
        // this is not the permission check. It handles a torn read: connections
        // and spaces are two queries, and a space can leave the caller's set
        // between them. Rendering a row with no space name is worse than
        // dropping it until the next read.
        .flatMap((connection) => {
          const spaceName = spaceNames.get(connection.space_id);
          return spaceName ? [toSummary(connection, spaceName, now)] : [];
        }),
    }));
}

export function countConnections(listings: readonly ProviderListing[]): number {
  return listings.reduce((total, listing) => total + listing.connections.length, 0);
}
