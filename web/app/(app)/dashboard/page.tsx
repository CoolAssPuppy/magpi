import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LiveRegion } from "@/components/live-region";
import { BadgePreview } from "@/components/screen/badge-preview";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { opsFor } from "@/lib/preview/fixtures";
import { listBadges, listConnections, listPageConfigs, listProviders } from "@/lib/queries";
import type { BadgeRow, ConnectionRow, ProviderRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Dashboard" };

const LIVE_TABLES = ["badges", "connections", "page_configs"];

export default async function DashboardPage() {
  const [badges, providers, connections, pages] = await Promise.all([
    listBadges(),
    listProviders(),
    listConnections(),
    listPageConfigs(),
  ]);

  const enabled = pages.filter((page) => page.enabled);
  const badge = badges[0];

  return (
    <AppShell current="/dashboard" title="Dashboard">
      <LiveRegion
        supabaseUrl={getSupabaseUrl()}
        supabasePublishableKey={getSupabasePublishableKey()}
        tables={LIVE_TABLES}
      />

      <div className="gap-xl flex flex-col">
        {badge ? (
          <BadgeStatus badge={badge} pollLabel={`${enabled.length} of ${pages.length} pages on`} />
        ) : (
          <EmptyState
            kicker="DASHBOARD, NO BADGE"
            heading="No badge yet"
            body="Pair one and this fills in."
            action={{ href: "/link", label: "Link a badge" }}
          />
        )}

        <div className="gap-xl flex flex-col lg:flex-row lg:items-start">
          <ConnectionList providers={providers} connections={connections} />
          <OnScreenNow slug={enabled[0]?.page_slug ?? null} count={enabled.length} />
        </div>
      </div>
    </AppShell>
  );
}

function BadgeStatus({ badge, pollLabel }: { badge: BadgeRow; pollLabel: string }) {
  return (
    <section className="gap-2xl rounded-panel border-border bg-surface p-xl flex flex-wrap items-center border">
      <div className="gap-sm flex w-[280px] shrink-0 flex-col">
        <div className="gap-sm flex items-center">
          <span
            className={
              isRecent(badge.last_seen_at)
                ? "size-sm rounded-pill bg-accent"
                : "size-sm rounded-pill bg-border-strong"
            }
          />
          <span className="font-display text-md">{badge.label ?? "Your badge"}</span>
        </div>
        <span className="text-ink-faint text-sm">{seenLabel(badge.last_seen_at)}</span>
      </div>
      <Fact label="POWER" value={badge.charging ? "USB" : "Battery"} />
      <Fact
        label="BATTERY"
        value={badge.battery_v ? `${badge.battery_v.toFixed(2)} V` : "Unknown"}
      />
      <Fact label="FIRMWARE" value={badge.fw ?? "Unknown"} />
      <Fact label="PAGES" value={pollLabel} />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="gap-2xs flex w-[150px] shrink-0 flex-col">
      <span className="font-display text-2xs text-ink-faint tracking-wide">{label}</span>
      <span className="font-display text-xl" data-numeric>
        {value}
      </span>
    </div>
  );
}

function ConnectionList({
  providers,
  connections,
}: {
  providers: ProviderRow[];
  connections: ConnectionRow[];
}) {
  const byProvider = new Map(connections.map((row) => [row.provider, row]));
  const active = connections.filter((row) => row.status === "active").length;

  return (
    <section className="rounded-panel border-border bg-surface flex flex-1 flex-col overflow-hidden border">
      <header className="border-border px-lg py-md flex items-center justify-between border-b">
        <h2 className="font-display text-2xs text-ink-faint tracking-wide">CONNECTED</h2>
        <span className="font-display text-2xs text-accent">
          {active} OF {providers.length}
        </span>
      </header>
      <ul>
        {providers.map((provider) => {
          const connection = byProvider.get(provider.slug);
          return (
            <li
              key={provider.slug}
              className="gap-md border-border px-lg py-md flex items-center border-b last:border-b-0"
            >
              <span className={`size-sm rounded-pill shrink-0 ${dotFor(connection)}`} />
              <span className="font-display flex-1 text-base">{provider.display_name}</span>
              <span
                className={
                  connection?.status === "error"
                    ? "text-critical w-[130px] shrink-0 text-right text-sm"
                    : "text-ink-faint w-[130px] shrink-0 text-right text-sm"
                }
              >
                {statusLabel(connection)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OnScreenNow({ slug, count }: { slug: string | null; count: number }) {
  return (
    <section className="rounded-panel border-border bg-surface flex w-full shrink-0 flex-col overflow-hidden border lg:w-[420px]">
      <header className="border-border px-lg py-md flex items-center justify-between border-b">
        <h2 className="font-display text-2xs text-ink-faint tracking-wide">ON THE SCREEN NOW</h2>
        <span className="font-display text-2xs text-live">LIVE</span>
      </header>
      <div className="p-xl flex items-center justify-center">
        {slug ? (
          <BadgePreview ops={opsFor(slug)} label={`${slug} on the badge`} />
        ) : (
          <span className="py-4xl text-ink-faint text-sm">No pages turned on yet.</span>
        )}
      </div>
      <footer className="border-border px-lg py-md text-ink-faint border-t text-sm">
        {count === 0 ? "Nothing to show" : `Page 1 of ${count}`}
      </footer>
    </section>
  );
}

function dotFor(connection: ConnectionRow | undefined): string {
  if (!connection) return "bg-border-strong";
  if (connection.status === "error") return "bg-critical";
  return "bg-accent";
}

function statusLabel(connection: ConnectionRow | undefined): string {
  if (!connection) return "Not connected";
  if (connection.status === "error") return "Reconnect";
  return connection.external_account ?? "Connected";
}

/** Within two poll intervals at the slowest setting, so a live badge reads live. */
function isRecent(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - Date.parse(lastSeenAt) < 600_000;
}

function seenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Never checked in";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(lastSeenAt)) / 1000));
  if (seconds < 60) return `Seen ${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Seen ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Seen ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Seen ${days} day${days === 1 ? "" : "s"} ago`;
}
