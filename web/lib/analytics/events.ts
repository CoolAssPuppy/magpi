/**
 * Every event this product sends, and the shape of its properties.
 *
 * A closed catalogue rather than free-form strings: an event name typed at a
 * call site is an event nobody finds again, and a property renamed in one
 * place and not another is a chart that quietly goes flat.
 */
export interface AnalyticsEvents {
  "badge paired": { badge_uid: string };
  "badge revoked": Record<string, never>;
  "badge renamed": Record<string, never>;
  "connection started": { provider: string; kind: "oauth" | "api_key" };
  "connection completed": { provider: string };
  "connection failed": { provider: string; reason: string };
  "connection removed": { provider: string };
  "page toggled": { page_slug: string; enabled: boolean };
  "pages reordered": { order: string[] };
  "page configured": { page_slug: string };
  "pomodoro settings saved": { work_min: number; sessions: number };
  "poll interval changed": { poll_interval_ms: number };
  "theme changed": { theme: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;
