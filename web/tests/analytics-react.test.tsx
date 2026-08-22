import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsPort } from "@/lib/analytics/types";

const mocked = vi.hoisted(() => ({
  pathname: "/dashboard",
  posthog: {
    init: [] as { key: string; options: Record<string, unknown> }[],
    captured: [] as { event: string; properties: unknown }[],
    identified: [] as { userId: string; traits: unknown }[],
    resets: 0,
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocked.pathname }));

vi.mock("posthog-js", () => ({
  default: {
    init: (key: string, options: Record<string, unknown>) =>
      mocked.posthog.init.push({ key, options }),
    capture: (event: string, properties: unknown) =>
      mocked.posthog.captured.push({ event, properties }),
    identify: (userId: string, traits: unknown) =>
      mocked.posthog.identified.push({ userId, traits }),
    reset: () => {
      mocked.posthog.resets += 1;
    },
  },
}));

const { createPostHogAnalytics } = await import("@/lib/analytics/posthog");
const { AnalyticsProvider } = await import("@/lib/analytics/provider");
const { useAnalytics } = await import("@/lib/analytics/use-analytics");
const { setAnalyticsForTesting } = await import("@/lib/analytics/client");
const { createNoopAnalytics } = await import("@/lib/analytics/noop");

afterEach(() => {
  mocked.pathname = "/dashboard";
  mocked.posthog.init = [];
  mocked.posthog.captured = [];
  mocked.posthog.identified = [];
  mocked.posthog.resets = 0;
  setAnalyticsForTesting(null);
});

function makePostHog() {
  return createPostHogAnalytics({ key: "phc_test", host: "https://ph.example.com" });
}

/** The one init call, or a failure that names what was recorded instead. */
function onlyInit() {
  const [first, ...rest] = mocked.posthog.init;
  if (!first || rest.length > 0) {
    throw new Error(`expected exactly one init, got ${mocked.posthog.init.length}`);
  }
  return first;
}

describe("the PostHog backend", () => {
  it("initialises once with the key and host it was handed", () => {
    makePostHog();

    expect(onlyInit().key).toBe("phc_test");
    expect(onlyInit().options.api_host).toBe("https://ph.example.com");
  });

  it("turns off autocapture, so a control panel is not turned into a heatmap", () => {
    makePostHog();

    expect(onlyInit().options).toMatchObject({
      autocapture: false,
      capture_pageview: false,
    });
  });

  it("forwards a catalogued event and its properties unchanged", () => {
    makePostHog().capture("page toggled", { page_slug: "deploys", enabled: false });

    expect(mocked.posthog.captured).toEqual([
      { event: "page toggled", properties: { page_slug: "deploys", enabled: false } },
    ]);
  });

  it("forwards identify and reset", () => {
    const analytics = makePostHog();
    analytics.identify("user-1", { plan: "free" });
    analytics.reset();

    expect(mocked.posthog.identified).toEqual([{ userId: "user-1", traits: { plan: "free" } }]);
    expect(mocked.posthog.resets).toBe(1);
  });

  it("reports a page view as the vendor's own event name", () => {
    makePostHog().pageView("/connections");

    expect(mocked.posthog.captured).toEqual([
      { event: "$pageview", properties: { $current_url: "/connections" } },
    ]);
  });
});

describe("the provider on the tree", () => {
  function recorder() {
    const views: string[] = [];
    const port: AnalyticsPort = {
      ...createNoopAnalytics(),
      pageView: (path: string) => views.push(path),
    };
    return { port, views };
  }

  function Consumer() {
    const analytics = useAnalytics();
    return <span>{typeof analytics.capture === "function" ? "wired" : "missing"}</span>;
  }

  it("reports a page view for the path it renders at", () => {
    const { port, views } = recorder();
    setAnalyticsForTesting(port);

    render(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );

    expect(views).toEqual(["/dashboard"]);
  });

  it("reports another view when the path changes", () => {
    const { port, views } = recorder();
    setAnalyticsForTesting(port);

    const { rerender } = render(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );
    mocked.pathname = "/settings";
    rerender(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );

    expect(views).toEqual(["/dashboard", "/settings"]);
  });

  it("puts a working client within reach of a component below it", () => {
    setAnalyticsForTesting(recorder().port);

    render(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );

    expect(screen.getByText("wired")).toBeInTheDocument();
  });

  it("hands a component outside the provider a client that does nothing, never undefined", () => {
    render(<Consumer />);

    expect(screen.getByText("wired")).toBeInTheDocument();
  });
});
