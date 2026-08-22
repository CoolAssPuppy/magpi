import type { AnalyticsEvents } from "./events";

/**
 * What the application is allowed to know about analytics.
 *
 * Application code depends on this and on the event catalogue, never on a
 * vendor SDK. Swapping the backend is one new file implementing this port plus
 * one line in provider.tsx.
 */
export interface AnalyticsPort {
  capture<K extends keyof AnalyticsEvents>(event: K, properties: AnalyticsEvents[K]): void;
  identify(userId: string, traits?: Record<string, string | number | boolean>): void;
  reset(): void;
  pageView(path: string): void;
}
