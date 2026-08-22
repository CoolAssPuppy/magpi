import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PairBadgeDialog } from "@/app/(app)/link/pair-dialog";
import { LiveRegion } from "@/components/live-region";
import { BadgePreview } from "@/components/screen/badge-preview";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { opsFor } from "@/lib/preview/fixtures";
import { pageNames } from "@/lib/preview/fixtures";
import { listBadges, listConnections, listPageConfigs } from "@/lib/queries";

import { Configure } from "@/app/(app)/pages/configure";
import type { PageRow } from "@/app/(app)/pages/page-list";
import { LABELS, REQUIRES, SOURCES, warningFor } from "@/app/(app)/pages/rows";
import type { BadgeRow } from "@/lib/rows";

export const metadata: Metadata = { title: "Dashboard" };

const LIVE_TABLES = ["badges", "connections", "page_configs"];

export default async function DashboardPage() {
  const [badges, connections, pages] = await Promise.all([
    listBadges(),
    listConnections(),
    listPageConfigs(),
  ]);

  const enabled = pages.filter((page) => page.enabled);
  const badge = badges[0];

  const byProvider = new Map(connections.map((row) => [row.provider, row]));
  const names = pageNames();
  const rows: PageRow[] = pages.map((config) => ({
    slug: config.page_slug,
    name: LABELS[config.page_slug] ?? names[config.page_slug] ?? config.page_slug,
    source: SOURCES[config.page_slug] ?? "",
    enabled: config.enabled,
    warning: warningFor(config.page_slug, byProvider, REQUIRES),
  }));

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
          <EmptyState heading="Pair a badge" aside={<PairBadgeDialog badges={badges} />} />
        )}

        <div className="gap-xl flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <Configure rows={rows} />
          </div>
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
