import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { ConnectionClaim } from '@/components/connections/connection-claim';
import { ConnectionList } from '@/components/connections/connection-list';
import { SyncActivity } from '@/components/connections/sync-activity';
import { loadConnectionsPage } from '@/lib/connections/queries';
import { getSessionContext } from '@/lib/supabase/context';

import {
  claimPendingConnection,
  disconnectConnection,
  resyncConnection,
  saveScopeSelection,
  startConnection,
} from './actions';

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; provider?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [{ listings, spaceIds, spaces, scopes }, query] = await Promise.all([
    loadConnectionsPage(context),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Connections"
        description="A connection imports one account of one source into one space."
      />

      {query.ticket && query.provider ? (
        <ConnectionClaim
          provider={query.provider}
          ticket={query.ticket}
          onClaim={claimPendingConnection}
        />
      ) : null}

      <SyncActivity spaceIds={spaceIds} />

      {listings.length > 0 ? (
        <ConnectionList
          listings={listings}
          spaces={spaces}
          scopes={scopes}
          onResync={resyncConnection}
          onDisconnect={disconnectConnection}
          onBegin={startConnection}
          onSaveScope={saveScopeSelection}
        />
      ) : (
        <EmptyState
          title="No sources are available"
          description="No providers are enabled on this deployment."
        />
      )}
    </>
  );
}
