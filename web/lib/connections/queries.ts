import 'server-only';

import { listSpaceOptions } from '@/lib/spaces/spaces';
import type { SessionContext } from '@/lib/supabase/context';

import {
  buildProviderListings,
  type ConnectionRecord,
  type ProviderListing,
  type ProviderRecord,
  type SpaceRecord,
} from './view-model';

/** Named columns, never a star: `authenticated` holds column-level select, not a table grant. */
const CONNECTION_COLUMNS =
  'id, provider, user_id, external_account_id, status, status_detail, last_synced_at, scope_selection';

const PROVIDER_COLUMNS =
  'slug, display_name, description, docs_url, enabled, position, scope_selection_kind';

type OwnedConnectionRecord = ConnectionRecord & { readonly user_id: string };

// Calls listSpaceOptions so the columns and the ordering match every other space list.
const fetchSpaces = (context: SessionContext): Promise<readonly SpaceRecord[]> =>
  listSpaceOptions(context.supabase);

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
  readonly spaces: readonly { readonly id: string; readonly name: string }[];
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
    spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
  };
}
