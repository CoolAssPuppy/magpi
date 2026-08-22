import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { listConnections, listProviders } from "@/lib/queries";
import type { ConnectionRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const [providers, connections] = await Promise.all([listProviders(), listConnections()]);
  const byProvider = new Map(connections.map((row) => [row.provider, row]));

  return (
    <AppShell current="/connections" title="Connections">
      <div className="max-w-panel flex flex-col">
        <header className="pb-md flex items-center justify-between">
          <h2 className="font-display text-2xs text-ink-faint tracking-wide">
            {providers.length} PROVIDERS, ALL READ ONLY
          </h2>
          <span className="text-ink-faint text-sm">
            Adding one is a migration, not a code change
          </span>
        </header>

        <ul className="border-border border">
          {providers.map((provider) => {
            const connection = byProvider.get(provider.slug);
            return (
              <li
                key={provider.slug}
                className="gap-lg border-border bg-surface px-lg py-lg flex items-center border-b last:border-b-0"
              >
                <span className={`size-sm rounded-pill shrink-0 ${dotFor(connection)}`} />
                <div className="gap-3xs flex w-[220px] shrink-0 flex-col">
                  <span className="font-display text-md">{provider.display_name}</span>
                  <span
                    className={
                      connection?.status === "error"
                        ? "text-critical text-xs"
                        : "text-ink-faint text-xs"
                    }
                  >
                    {connection?.error_message ?? provider.description}
                  </span>
                </div>
                <span className="font-display text-ink-faint flex-1 text-xs">
                  {provider.kind === "api_key" ? "API KEY" : shortScopes(provider.scopes)}
                </span>
                <Link
                  href={`/connections/${provider.slug}`}
                  className={
                    connection
                      ? "text-ink-muted w-[96px] shrink-0 text-right text-sm"
                      : "font-display text-accent w-[96px] shrink-0 text-right text-sm"
                  }
                >
                  {connection ? "Manage" : "Connect"}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}

function dotFor(connection: ConnectionRow | undefined): string {
  if (!connection) return "bg-border-strong";
  if (connection.status === "error") return "bg-critical";
  return "bg-accent";
}

/** The last path segment of each scope. A full Google scope URL is unreadable. */
function shortScopes(scopes: string[]): string {
  return scopes.map((scope) => scope.split("/").pop() ?? scope).join("  ");
}
