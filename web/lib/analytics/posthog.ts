import posthog from "posthog-js";

import type { AnalyticsEvents } from "./events";
import type { AnalyticsPort } from "./types";

export interface PostHogOptions {
  key: string;
  host: string;
}

/**
 * The one file that names PostHog.
 *
 * Autocapture and automatic pageviews are off. Every event in this product is
 * in the catalogue, and a heatmap of a control panel nobody browses is noise
 * that costs a page load.
 */
export function createPostHogAnalytics({ key, host }: PostHogOptions): AnalyticsPort {
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });

  return {
    capture<K extends keyof AnalyticsEvents>(event: K, properties: AnalyticsEvents[K]) {
      posthog.capture(event, properties);
    },
    identify(userId, traits) {
      posthog.identify(userId, traits);
    },
    reset() {
      posthog.reset();
    },
    pageView(path) {
      posthog.capture("$pageview", { $current_url: path });
    },
  };
}
