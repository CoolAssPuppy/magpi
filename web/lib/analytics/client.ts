import { getPostHogHost, getPostHogKey } from "@/lib/env";

import { createNoopAnalytics } from "./noop";
import { createPostHogAnalytics } from "./posthog";
import type { AnalyticsPort } from "./types";

let instance: AnalyticsPort | null = null;

/**
 * The single analytics client for the tab.
 *
 * A module singleton rather than a memo, because the vendor SDK initialises a
 * global of its own and calling init twice in one document is a second
 * identity for the same visitor. This is also the only place a concrete
 * provider is chosen: adding a second one is another branch here and nothing
 * else in the application.
 */
export function getAnalytics(): AnalyticsPort {
  if (instance) return instance;
  const key = getPostHogKey();
  instance = key ? createPostHogAnalytics({ key, host: getPostHogHost() }) : createNoopAnalytics();
  return instance;
}

/** Tests only. Lets a suite swap the backend without a live SDK. */
export function setAnalyticsForTesting(port: AnalyticsPort | null): void {
  instance = port;
}
