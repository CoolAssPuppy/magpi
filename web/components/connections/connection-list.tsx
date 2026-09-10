import type { ActionState } from '@/lib/actions/state';
import type { ConnectionSummary, ProviderListing } from '@/lib/connections/view-model';

import { ConnectButton, type SpaceChoice } from './connect-button';
import { ConnectionActions, type ConnectionAction } from './connection-actions';
import { ScopeEditor, type ConnectionScope, type SaveScope } from './scope-editor';
import { StatusPill } from '@/components/app/status-pill';

function ConnectionRow({
  connection,
  scope,
  onResync,
  onDisconnect,
  onSaveScope,
}: {
  connection: ConnectionSummary;
  scope: ConnectionScope | undefined;
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
  onSaveScope: SaveScope;
}) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={connection.status.tone} label={connection.status.label} />
            <span className="text-sm text-foreground">{connection.spaceName}</span>
            <span className="text-xs text-tertiary-foreground">{connection.account}</span>
          </div>
          <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
            {connection.status.reason}
          </p>
          <p className="mt-0.5 text-xs text-tertiary-foreground">
            {connection.lastSynced} &middot; {connection.scope}
          </p>
        </div>

        <ConnectionActions
          connection={connection}
          onResync={onResync}
          onDisconnect={onDisconnect}
        />
      </div>

      {scope ? <ScopeEditor connection={scope} onSaveScope={onSaveScope} /> : null}
    </li>
  );
}

/** Providers as a list of rows, one section per provider. */
export function ConnectionList({
  listings,
  spaces,
  scopes,
  onResync,
  onDisconnect,
  onBegin,
  onSaveScope,
}: {
  listings: readonly ProviderListing[];
  spaces: readonly SpaceChoice[];
  scopes: readonly ConnectionScope[];
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
  onBegin: (providerSlug: string, spaceId: string) => Promise<ActionState<undefined>>;
  onSaveScope: SaveScope;
}) {
  return (
    <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {listings.map((listing) => (
        <section key={listing.slug} className="px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading text-sm font-medium text-foreground">
                {listing.displayName}
              </h2>
              <p className="mt-0.5 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
                {listing.description}
              </p>
            </div>
            <ConnectButton
              providerSlug={listing.slug}
              displayName={listing.displayName}
              spaces={spaces}
              hasConnection={listing.connections.length > 0}
              onBegin={onBegin}
            />
          </div>

          {listing.connections.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {listing.connections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  scope={scopes.find((candidate) => candidate.id === connection.id)}
                  onResync={onResync}
                  onDisconnect={onDisconnect}
                  onSaveScope={onSaveScope}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
