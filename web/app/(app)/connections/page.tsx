import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { ConnectionList } from '@/components/connections/connection-list';
import { SyncActivity } from '@/components/connections/sync-activity';
import { Button } from '@/components/ui/button';
import { loadConnectionsPage } from '@/lib/connections/queries';
import { countConnections } from '@/lib/connections/view-model';
import { getSessionContext } from '@/lib/supabase/context';

import { disconnectConnection, resyncConnection } from './actions';

export default async function ConnectionsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { listings, spaceIds } = await loadConnectionsPage(context);
  const connected = countConnections(listings);
  const first = listings[0];

  return (
    <>
      <PageHeader
        title="Connections"
        description="A connection reads one account of one source into one space. Only people in that space can see what it brings in."
      />

      <SyncActivity spaceIds={spaceIds} />

      {connected === 0 ? (
        <EmptyState
          title="Nothing is connected yet"
          description="Magpi answers from what you connect to it. Start with the source your team writes in most, pick the space it lands in, and the first import runs straight away."
          action={
            first ? (
              <Button asChild>
                <Link href={`/connections/${first.slug}`}>Connect {first.displayName}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {listings.length > 0 ? (
        <ConnectionList
          listings={listings}
          onResync={resyncConnection}
          onDisconnect={disconnectConnection}
        />
      ) : (
        <EmptyState
          title="No sources are available"
          description="Providers are rows in the database and none are enabled on this deployment yet."
        />
      )}
    </>
  );
}
