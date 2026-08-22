import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { pageNames } from "@/lib/preview/fixtures";
import { listConnections, listPageConfigs } from "@/lib/queries";

import { Configure } from "./configure";
import type { PageRow } from "./page-list";

export const metadata: Metadata = { title: "Pages" };

/** Which providers each page cannot draw without. The gateway holds the same map. */
const REQUIRES: Record<string, string[]> = {
  next_thing: ["google"],
  day_shape: ["google"],
  deploys: ["vercel"],
  counters: [],
  one_number: ["posthog"],
};

const SOURCES: Record<string, string> = {
  next_thing: "Google Calendar",
  day_shape: "Google Calendar",
  deploys: "Vercel",
  counters: "Gmail, Linear, Slack, GitHub",
  one_number: "PostHog",
};

const LABELS: Record<string, string> = {
  next_thing: "Next thing",
  day_shape: "Day shape",
  deploys: "Deploy state",
  counters: "Counters",
  one_number: "One number",
};

export default async function PagesPage() {
  const [configs, connections] = await Promise.all([listPageConfigs(), listConnections()]);

  const byProvider = new Map(connections.map((row) => [row.provider, row]));
  const names = pageNames();

  const rows: PageRow[] = configs.map((config) => ({
    slug: config.page_slug,
    name: LABELS[config.page_slug] ?? names[config.page_slug] ?? config.page_slug,
    source: SOURCES[config.page_slug] ?? "",
    enabled: config.enabled,
    warning: warningFor(config.page_slug, byProvider),
  }));

  const anyConnection = connections.some((row) => row.status === "active");

  return (
    <AppShell current="/pages" title="Pages">
      {anyConnection ? (
        <Configure rows={rows} />
      ) : (
        <div className="gap-xl flex flex-col">
          <EmptyState
            kicker="PAGES, NOTHING CONNECTED"
            heading="Nothing to draw yet"
            body="Google covers three of the five pages. Connect it and these fill in."
            action={{ href: "/connections/google", label: "Connect Google" }}
          />
          <Configure rows={rows} />
        </div>
      )}
    </AppShell>
  );
}

/**
 * Says why a page cannot draw, in the wearer's terms.
 *
 * A provider in the error state is worse than an absent one: the page looks
 * configured and shows nothing, so it is named rather than left to the badge
 * to report twelve hours later.
 */
function warningFor(slug: string, byProvider: Map<string, { status: string }>): string | null {
  const required = REQUIRES[slug] ?? [];
  for (const provider of required) {
    const connection = byProvider.get(provider);
    if (!connection) return `${titleCase(provider)} is not connected`;
    if (connection.status === "error") return `${titleCase(provider)} needs reconnecting`;
  }
  return null;
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
