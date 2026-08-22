import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ProviderMark } from "@/components/provider-mark";

import { Connect } from "./connect";
import { ConnectionItem } from "./connection-item";
import { listConnections, listProviders } from "@/lib/queries";
import type { ConnectionRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Connections" };

const BEGIN_ERRORS: Record<string, string> = {
  begin: "That provider is not configured on this deployment yet.",
  unknown_provider: "There is no such provider.",
  no_ticket: "That link is incomplete. Start the connection again.",
  claim: "That connection could not be completed. Start it again.",
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorKey ? BEGIN_ERRORS[errorKey] : null;
  const justConnected = params.connected === "1";

  const [providers, connections] = await Promise.all([listProviders(), listConnections()]);
  // Many per provider now, in the order they were connected.
  const byProvider = new Map<string, typeof connections>();
  for (const row of connections) {
    byProvider.set(row.provider, [...(byProvider.get(row.provider) ?? []), row]);
  }

  return (
    <AppShell current="/connections" title="Connections">
      <div className="max-w-panel flex flex-col">
        {justConnected ? (
          <p
            role="status"
            className="border-l-edge border-accent bg-surface px-lg py-md mb-md text-sm"
          >
            Connected. Name it below if you have more than one.
          </p>
        ) : null}
        {errorMessage ? (
          <p
            role="alert"
            className="border-l-edge border-critical bg-surface px-lg py-md mb-md text-sm"
          >
            {errorMessage}
          </p>
        ) : null}
        <header className="pb-md flex items-center justify-between">
          <h2 className="font-display text-2xs text-ink-faint tracking-wide">
            {providers.length} PROVIDERS, ALL READ ONLY
          </h2>
        </header>

        <ul className="border-border border">
          {providers.map((provider) => {
            const rows = byProvider.get(provider.slug) ?? [];
            return (
              <li
                key={provider.slug}
                className={`border-border bg-surface px-lg py-lg flex flex-col border-b last:border-b-0 ${
                  provider.enabled ? "" : "opacity-60"
                }`}
              >
                <div className="gap-lg flex items-center">
                  <span className={`size-sm rounded-pill shrink-0 ${dotFor(rows)}`} />
                  <span className="text-ink-muted flex shrink-0 items-center">
                    <ProviderMark slug={provider.slug} />
                  </span>
                  <div className="gap-3xs flex flex-1 flex-col">
                    <span className="font-display text-md">{provider.display_name}</span>
                    <span className="text-ink-faint text-xs">{provider.description}</span>
                  </div>
                  {provider.enabled ? (
                    <div className="relative shrink-0">
                      <Connect
                        provider={provider.slug}
                        kind={provider.kind === "api_key" ? "api_key" : "oauth"}
                      />
                    </div>
                  ) : (
                    <span className="text-ink-faint shrink-0 text-right text-sm">Not set up</span>
                  )}
                </div>

                {rows.length > 0 ? (
                  <ul className="pt-md pl-2xl flex flex-col">
                    {rows.map((row) => (
                      <ConnectionItem
                        key={row.id}
                        connection={row}
                        kind={provider.kind === "api_key" ? "api_key" : "oauth"}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}

function dotFor(rows: ConnectionRow[]): string {
  if (rows.length === 0) return "bg-border-strong";
  if (rows.some((row) => row.status === "error")) return "bg-critical";
  return "bg-accent";
}
