import 'server-only';

import type { SessionContext } from '@/lib/supabase/context';

import { parseScopeSelection, type ScopeSelection } from './scope-selection';
import { describeConnectionStatus } from './status';
import {
  buildProviderListings,
  type ConnectionRecord,
  type ProviderListing,
  type ProviderRecord,
  type SpaceRecord,
} from './view-model';

/**
 * Never selects access_token_enc or refresh_token_enc. A token has no business
 * leaving the database, and the surest way to keep it there is to never name the
 * column in a query the web app runs.
 */
const CONNECTION_COLUMNS =
  'id, provider, space_id, user_id, external_account_id, status, status_detail, last_synced_at, scope_selection';

const PROVIDER_COLUMNS =
  'slug, display_name, description, docs_url, enabled, position, scope_selection_kind';

type OwnedConnectionRecord = ConnectionRecord & { readonly user_id: string };

async function fetchSpaces(context: SessionContext): Promise<readonly SpaceRecord[]> {
  const { data, error } = await context.supabase
    .from('spaces')
    .select('id, name, kind')
    .order('name');
  if (error) throw new Error(`Could not read spaces: ${error.message}`);
  return data;
}

async function fetchProviders(context: SessionContext): Promise<readonly ProviderRecord[]> {
  const { data, error } = await context.supabase
    .from('providers')
    .select(PROVIDER_COLUMNS)
    .order('position');
  if (error) throw new Error(`Could not read providers: ${error.message}`);
  return data;
}

async function fetchConnections(
  context: SessionContext,
  providerSlug?: string,
): Promise<readonly OwnedConnectionRecord[]> {
  const query = context.supabase
    .from('connections')
    .select(CONNECTION_COLUMNS)
    .order('created_at', { ascending: true });

  const { data, error } = providerSlug ? await query.eq('provider', providerSlug) : await query;
  if (error) throw new Error(`Could not read connections: ${error.message}`);
  return data;
}

export type ConnectionsPageData = {
  readonly listings: readonly ProviderListing[];
  readonly spaceIds: readonly string[];
};

export async function loadConnectionsPage(context: SessionContext): Promise<ConnectionsPageData> {
  const [providers, connections, spaces] = await Promise.all([
    fetchProviders(context),
    fetchConnections(context),
    fetchSpaces(context),
  ]);

  return {
    listings: buildProviderListings({ providers, connections, spaces, now: new Date() }),
    spaceIds: spaces.map((space) => space.id),
  };
}

export type ProviderScreenConnection = {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly account: string;
  readonly status: ReturnType<typeof describeConnectionStatus>;
  readonly selection: ScopeSelection;
};

export type ProviderScreenData = {
  readonly provider: ProviderRecord;
  readonly spaces: readonly SpaceRecord[];
  readonly connections: readonly ProviderScreenConnection[];
};

export async function loadProviderScreen(
  context: SessionContext,
  providerSlug: string,
): Promise<ProviderScreenData | null> {
  const [{ data: provider }, connections, spaces] = await Promise.all([
    context.supabase
      .from('providers')
      .select(PROVIDER_COLUMNS)
      .eq('slug', providerSlug)
      .maybeSingle(),
    fetchConnections(context, providerSlug),
    fetchSpaces(context),
  ]);

  if (!provider) return null;

  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));

  return {
    provider,
    spaces,
    connections: connections.flatMap((connection) => {
      const spaceName = spaceNames.get(connection.space_id);
      if (!spaceName) return [];

      const parsed = parseScopeSelection(connection.scope_selection);

      return [
        {
          id: connection.id,
          spaceId: connection.space_id,
          spaceName,
          account: connection.external_account_id ?? 'Account not recorded',
          status: describeConnectionStatus({
            status: connection.status,
            statusDetail: connection.status_detail,
            lastSyncedAt: connection.last_synced_at,
          }),
          selection: parsed.ok ? parsed.data : { kind: 'unset' },
        },
      ];
    }),
  };
}
