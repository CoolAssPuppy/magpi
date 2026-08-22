import { afterEach, describe, expect, it, vi } from "vitest";

import { getAnalytics, setAnalyticsForTesting } from "@/lib/analytics/client";
import { createNoopAnalytics } from "@/lib/analytics/noop";
import type { AnalyticsPort } from "@/lib/analytics/types";

afterEach(() => {
  setAnalyticsForTesting(null);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the no-op backend", () => {
  it("accepts every call on the port and does nothing", () => {
    const analytics = createNoopAnalytics();
    expect(() => {
      analytics.capture("badge paired", { badge_uid: "e6614103" });
      analytics.identify("user-1", { plan: "free" });
      analytics.pageView("/dashboard");
      analytics.reset();
    }).not.toThrow();
  });

  it("satisfies the port, so a swap cannot miss a method", () => {
    const analytics: AnalyticsPort = createNoopAnalytics();
    for (const method of ["capture", "identify", "reset", "pageView"] as const) {
      expect(typeof analytics[method]).toBe("function");
    }
  });
});

describe("choosing a backend", () => {
  it("uses the no-op backend when no key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const analytics = getAnalytics();
    expect(() => analytics.capture("badge revoked", {})).not.toThrow();
  });

  it("hands back the same client twice, so the vendor never initialises twice", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(getAnalytics()).toBe(getAnalytics());
  });

  it("lets a test swap the backend without a live SDK", () => {
    const captured: string[] = [];
    const fake: AnalyticsPort = {
      capture: (event) => captured.push(event),
      identify: () => {},
      reset: () => {},
      pageView: () => {},
    };
    setAnalyticsForTesting(fake);

    getAnalytics().capture("page toggled", { page_slug: "deploys", enabled: true });
    expect(captured).toEqual(["page toggled"]);
  });
});

describe("the event catalogue", () => {
  it("types an event's properties, so a renamed field fails the build", async () => {
    // A compile-time guarantee, asserted here so the file is covered and the
    // intent is written down: capture only accepts a name in the catalogue.
    const { createNoopAnalytics: make } = await import("@/lib/analytics/noop");
    const analytics = make();

    analytics.capture("connection failed", { provider: "posthog", reason: "401" });
    analytics.capture("pages reordered", { order: ["next_thing", "deploys"] });
    analytics.capture("poll interval changed", { poll_interval_ms: 30000 });

    // @ts-expect-error an event outside the catalogue is refused
    analytics.capture("made up event", {});
    // @ts-expect-error a property the catalogue does not declare is refused
    analytics.capture("badge renamed", { nickname: "desk" });
  });
});
