import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/app/page-header';
import { ConnectPanel } from '@/components/connections/connect-panel';
import { ConnectionClaim } from '@/components/connections/connection-claim';
import { SyncActivity } from '@/components/connections/sync-activity';
import { loadProviderScreen } from '@/lib/connections/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { claimPendingConnection, saveScopeSelection, startConnection } from '../actions';

export default async function ProviderConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ ticket?: string; space?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const [{ provider: slug }, query] = await Promise.all([params, searchParams]);
  const screen = await loadProviderScreen(context, slug);
  if (!screen || screen.spaces.length === 0) notFound();

  const initialSpaceId =
    query.space && screen.spaces.some((space) => space.id === query.space)
      ? query.space
      : screen.spaces[0].id;

  return (
    <>
      <PageHeader
        title={screen.provider.display_name}
        description={screen.provider.description}
        actions={
          <Link
            href="/connections"
            className="text-sm text-foreground-lighter hover:text-foreground"
          >
            All connections
          </Link>
        }
      />

      {query.ticket ? (
        <ConnectionClaim
          provider={screen.provider.slug}
          ticket={query.ticket}
          onClaim={claimPendingConnection}
        />
      ) : null}

      <SyncActivity spaceIds={screen.spaces.map((space) => space.id)} />

      <ConnectPanel
        provider={{
          slug: screen.provider.slug,
          displayName: screen.provider.display_name,
          description: screen.provider.description,
          docsUrl: screen.provider.docs_url,
          scopeSelectionKind: screen.provider.scope_selection_kind,
        }}
        spaces={screen.spaces.map((space) => ({ id: space.id, name: space.name }))}
        connections={screen.connections}
        initialSpaceId={initialSpaceId}
        onBegin={startConnection.bind(null, screen.provider.slug)}
        onSaveScope={saveScopeSelection}
      />
    </>
  );
}
