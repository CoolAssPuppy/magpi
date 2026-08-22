import type { Metadata } from "next";

import { PairBadgeDialog } from "@/app/(app)/link/pair-dialog";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LiveRegion } from "@/components/live-region";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { listBadges } from "@/lib/queries";

import { BadgeList } from "@/app/(app)/link/badge-list";

export const metadata: Metadata = { title: "Badges" };

export default async function BadgesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [badges, params] = await Promise.all([listBadges(), searchParams]);

  return (
    <AppShell
      current="/badges"
      title="Badges"
      status={<PairBadgeDialog badges={badges} defaultOpen={params.pair === "1"} />}
    >
      {/* Approval arrives from the device's own poll, so this page has to hear
          about it rather than wait for a refresh. */}
      <LiveRegion
        supabaseUrl={getSupabaseUrl()}
        supabasePublishableKey={getSupabasePublishableKey()}
        tables={["badges"]}
      />

      {badges.length === 0 ? (
        <EmptyState heading="No badges yet" body="Pair one and it appears here." />
      ) : (
        <div className="max-w-panel">
          <BadgeList badges={badges} />
        </div>
      )}
    </AppShell>
  );
}
