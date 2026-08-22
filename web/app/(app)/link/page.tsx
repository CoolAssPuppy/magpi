import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { LiveRegion } from "@/components/live-region";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { listBadges } from "@/lib/queries";

import { BadgeList } from "./badge-list";
import { PairingCard } from "./pairing-card";

export const metadata: Metadata = { title: "Link a badge" };

export default async function LinkPage() {
  const badges = await listBadges();

  return (
    <AppShell
      current="/link"
      title="Link a badge"
      status={
        <span className="font-display text-live text-xs">
          {badges.length === 0 ? "WAITING FOR A BADGE" : "PAIRED"}
        </span>
      }
    >
      {/* Approval arrives from the device's own poll, so this page has to hear
          about it rather than wait for a refresh. */}
      <LiveRegion
        supabaseUrl={getSupabaseUrl()}
        supabasePublishableKey={getSupabasePublishableKey()}
        tables={["badges"]}
      />

      <div className="gap-xl flex flex-col lg:flex-row lg:items-start">
        <PairingCard />
        <BadgeList badges={badges} />
      </div>
    </AppShell>
  );
}
