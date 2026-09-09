import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { ConnectionSummary, ProviderListing } from '@/lib/connections/view-model';

import { ConnectionActions, type ConnectionAction } from './connection-actions';
import { StatusPill } from './status-pill';

function ConnectionRow({
  connection,
  onResync,
  onDisconnect,
}: {
  connection: ConnectionSummary;
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={connection.status.tone} label={connection.status.label} />
          <span className="text-sm text-foreground">{connection.spaceName}</span>
          <span className="text-xs text-foreground-lighter">{connection.account}</span>
        </div>
        <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">
          {connection.status.reason}
        </p>
        <p className="mt-0.5 text-xs text-foreground-lighter">
          {connection.lastSynced} &middot; {connection.scope}
        </p>
      </div>

      <ConnectionActions
        connection={connection}
        onResync={onResync}
        onDisconnect={onDisconnect}
      />
    </li>
  );
}

/**
 * Providers are rows in a table, so this is a list of rows and not a grid of
 * cards that differ only by name.
 */
export function ConnectionList({
  listings,
  onResync,
  onDisconnect,
}: {
  listings: readonly ProviderListing[];
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
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
              <p className="mt-0.5 max-w-[var(--measure-prose)] text-sm text-foreground-lighter">
                {listing.description}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/connections/${listing.slug}`}>
                {listing.connections.length > 0
                  ? `Add another ${listing.displayName}`
                  : `Connect ${listing.displayName}`}
              </Link>
            </Button>
          </div>

          {listing.connections.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {listing.connections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  onResync={onResync}
                  onDisconnect={onDisconnect}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
