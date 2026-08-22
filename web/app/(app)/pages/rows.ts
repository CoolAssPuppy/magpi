/**
 * What each Notifier page is called, what feeds it, and why it cannot draw.
 *
 * Its own file because the dashboard renders the list and the /pages route
 * forwards to it, so neither owns these.
 */

/** Which providers each page cannot draw without. The gateway holds the same map. */
export const REQUIRES: Record<string, string[]> = {
  next_thing: ["google"],
  day_shape: ["google"],
  deploys: ["vercel"],
  counters: [],
  one_number: ["posthog"],
};

export const SOURCES: Record<string, string> = {
  next_thing: "Google Calendar",
  day_shape: "Google Calendar",
  deploys: "Vercel",
  counters: "Gmail, Linear, Slack, GitHub, Notion",
  one_number: "PostHog",
};

export const LABELS: Record<string, string> = {
  next_thing: "Next thing",
  day_shape: "Day shape",
  deploys: "Deploy state",
  counters: "Counters",
  one_number: "One number",
};

/**
 * Says why a page cannot draw, in the wearer's terms.
 *
 * A provider in the error state is worse than an absent one: the page looks
 * configured and shows nothing, so it is named rather than left to the badge
 * to report twelve hours later.
 */
export function warningFor(
  slug: string,
  byProvider: Map<string, { status: string }>,
  requires: Record<string, string[]> = REQUIRES,
): string | null {
  for (const provider of requires[slug] ?? []) {
    const connection = byProvider.get(provider);
    if (!connection) return `${titleCase(provider)} is not connected`;
    if (connection.status === "error") return `${titleCase(provider)} needs reconnecting`;
  }
  return null;
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
