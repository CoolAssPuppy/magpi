import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ProviderMark } from "@/components/provider-mark";

import { Connect } from "./connect";
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
        </header>

        <ul className="border-border border">
          {providers.map((provider) => {
            const connection = byProvider.get(provider.slug);
            return (
              <li
                key={provider.slug}
                className={`gap-lg border-border bg-surface px-lg py-lg flex items-center border-b last:border-b-0 ${
                  provider.enabled ? "" : "opacity-60"
                }`}
              >
                <span className={`size-sm rounded-pill shrink-0 ${dotFor(connection)}`} />
                <span className="text-ink-muted flex shrink-0 items-center">
                  <ProviderMark slug={provider.slug} />
                </span>
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
                <span className="flex-1" />
                {provider.enabled ? (
                  <div className="relative shrink-0">
                    <Connect
                      provider={provider.slug}
                      kind={provider.kind === "api_key" ? "api_key" : "oauth"}
                      isConnected={Boolean(connection)}
                    />
                  </div>
                ) : (
                  <span className="text-ink-faint shrink-0 text-right text-sm">Not set up</span>
                )}
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
