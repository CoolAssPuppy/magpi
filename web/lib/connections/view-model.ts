import type { Json, Tables } from '@/lib/database.types';

import {
  describeScopeSelection,
  parseScopeSelection,
  type ScopeSelection,
} from './scope-selection';
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
  'id' | 'provider' | 'external_account_id' | 'status' | 'status_detail' | 'last_synced_at'
> & { readonly scope_selection: Json };

export type SpaceRecord = Pick<Tables<'spaces'>, 'id' | 'name' | 'kind'>;

export type ConnectionSummary = {
  readonly id: string;
  readonly provider: string;
  readonly account: string;
  /** Names of the spaces this feeds, already narrowed to the ones the reader is in. */
  readonly destinations: readonly string[];
  readonly scope: string;
  readonly lastSynced: string;
  readonly status: ConnectionStatusView;
  readonly selection: ScopeSelection;
};

export type ProviderListing = {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly scopeSelectionKind: string | null;
  readonly enabled: boolean;
  readonly connections: readonly ConnectionSummary[];
};

/**
 * The routing as this reader is allowed to see it. RLS lets a whole row through when one route
 * reaches a space they are in, so the routes to spaces they are not in are dropped here.
 */
function visibleSelection(
  scopeSelection: Json,
  visibleSpaceIds: ReadonlySet<string>,
): ScopeSelection {
  const parsed = parseScopeSelection(scopeSelection);
  if (!parsed.ok) return { kind: 'unset' };
  if (parsed.data.kind === 'unset') return parsed.data;

  const routes = Object.fromEntries(
    Object.entries(parsed.data.routes).filter(([, spaceId]) => visibleSpaceIds.has(spaceId)),
  );
  return { ...parsed.data, routes };
}

function toSummary(
  connection: ConnectionRecord,
  selection: ScopeSelection,
  spaceNames: ReadonlyMap<string, string>,
  now: Date,
): ConnectionSummary {
  const destinations =
    selection.kind === 'set'
      ? [...new Set(Object.values(selection.routes))].flatMap((id) => {
          const name = spaceNames.get(id);
          return name ? [name] : [];
        })
      : [];

  return {
    id: connection.id,
    provider: connection.provider,
    account: connection.external_account_id ?? 'Account not recorded',
    destinations: destinations.sort((a, b) => a.localeCompare(b)),
    scope: describeScopeSelection(selection),
    lastSynced: formatLastSynced(connection.last_synced_at, now),
    status: describeConnectionStatus({
      status: connection.status,
      statusDetail: connection.status_detail,
      lastSyncedAt: connection.last_synced_at,
    }),
    selection,
  };
}

/** Every enabled provider, plus any disabled one the caller still has a connection to. */
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
  const visibleSpaceIds = new Set(spaces.map((space) => space.id));

  return (
    providers
      // A disabled provider stays in the list. The page marks it rather than offering a button.
      .slice()
      .sort((a, b) => a.position - b.position || a.display_name.localeCompare(b.display_name))
      .map((provider) => ({
        slug: provider.slug,
        displayName: provider.display_name,
        description: provider.description,
        docsUrl: provider.docs_url,
        scopeSelectionKind: provider.scope_selection_kind,
        enabled: provider.enabled,
        connections: connections
          .filter((connection) => connection.provider === provider.slug)
          .map((connection) =>
            toSummary(
              connection,
              visibleSelection(connection.scope_selection, visibleSpaceIds),
              spaceNames,
              now,
            ),
          ),
      }))
  );
}
