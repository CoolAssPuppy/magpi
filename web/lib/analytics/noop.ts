import type { AnalyticsPort } from "./types";

/**
 * What runs when no key is configured, which is every local checkout and every
 * test. Calls are dropped rather than queued: a build with no analytics should
 * behave exactly like one with them, minus the network.
 */
export function createNoopAnalytics(): AnalyticsPort {
  return {
    capture() {},
    identify() {},
    reset() {},
    pageView() {},
  };
}
