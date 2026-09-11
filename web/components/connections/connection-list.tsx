import type { ActionState } from '@/lib/actions/state';
import type { ConnectionSummary, ProviderListing } from '@/lib/connections/view-model';

import { SourceMark } from '@/components/brand/source-mark';

import { ConnectButton, type SpaceChoice } from './connect-button';
import { ConnectionActions, type ConnectionAction } from './connection-actions';
import { ScopeEditor, type SaveScope } from './scope-editor';
import { StatusPill } from '@/components/app/status-pill';

function ConnectionRow({
  connection,
  spaces,
  onResync,
  onDisconnect,
  onBegin,
  onSaveScope,
}: {
  connection: ConnectionSummary;
  spaces: readonly SpaceChoice[];
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
  onBegin: (providerSlug: string) => Promise<ActionState<undefined>>;
  onSaveScope: SaveScope;
}) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={connection.status.tone} label={connection.status.label} />
            <span className="text-sm text-foreground">{connection.account}</span>
            {connection.destinations.length > 0 ? (
              <span className="text-xs text-tertiary-foreground">
                into {connection.destinations.join(', ')}
              </span>
            ) : (
              <span className="text-xs text-tertiary-foreground">not routed anywhere</span>
            )}
          </div>
          <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
            {connection.status.reason}
          </p>
          <p className="mt-0.5 text-xs text-tertiary-foreground">{connection.lastSynced}</p>
        </div>

        <ConnectionActions
          connection={connection}
          onResync={onResync}
          onDisconnect={onDisconnect}
          onBegin={onBegin}
        />
      </div>

      <ScopeEditor connection={connection} spaces={spaces} onSaveScope={onSaveScope} />
    </li>
  );
}

/** Providers as a list of rows, one section per provider. */
export function ConnectionList({
  listings,
  spaces,
  onResync,
  onDisconnect,
  onBegin,
  onSaveScope,
}: {
  listings: readonly ProviderListing[];
  spaces: readonly SpaceChoice[];
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
  onBegin: (providerSlug: string) => Promise<ActionState<undefined>>;
  onSaveScope: SaveScope;
}) {
  return (
    <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {listings.map((listing) => (
        <section key={listing.slug} className="px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-heading text-sm font-medium text-foreground">
                <SourceMark source={listing.slug} className="size-5" fallback />
                {listing.displayName}
              </h2>
              <p className="mt-0.5 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
                {listing.description}
              </p>
            </div>
            {listing.enabled ? (
              <ConnectButton
                providerSlug={listing.slug}
                displayName={listing.displayName}
                hasConnection={listing.connections.length > 0}
                onBegin={onBegin}
              />
            ) : (
              <span className="shrink-0 rounded-[var(--radius-panel)] border border-border px-2.5 py-1 text-xs text-tertiary-foreground">
                Coming soon
              </span>
            )}
          </div>

          {listing.connections.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {listing.connections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  spaces={spaces}
                  onResync={onResync}
                  onBegin={onBegin}
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
