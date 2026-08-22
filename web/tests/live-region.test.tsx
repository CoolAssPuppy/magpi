import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveRegion, type LiveRegionProps } from "@/components/live-region";

/**
 * Realtime is the whole behaviour of this component, so the Supabase client and
 * the router stand in for the network and Next's cache. Nothing else about the
 * component is visible: it renders nothing.
 */
const realtime = vi.hoisted(() => {
  interface Watch {
    table: string;
    schema: string;
    event: string;
    fire: () => void;
  }

  const state = {
    credentials: [] as Array<{ url: string; key: string }>,
    channelNames: [] as string[],
    watches: [] as Watch[],
    subscribed: 0,
    removed: [] as string[],
    refreshed: 0,
    reset() {
      state.credentials.length = 0;
      state.channelNames.length = 0;
      state.watches.length = 0;
      state.subscribed = 0;
      state.removed.length = 0;
      state.refreshed = 0;
    },
  };
  return state;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      realtime.refreshed += 1;
    },
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: (url: string, key: string) => {
    realtime.credentials.push({ url, key });
    return {
      channel(name: string) {
        realtime.channelNames.push(name);
        const channel = {
          name,
          on(
            event: string,
            filter: { event: string; schema: string; table: string },
            callback: () => void,
          ) {
            realtime.watches.push({
              table: filter.table,
              schema: filter.schema,
              event: `${event}:${filter.event}`,
              fire: callback,
            });
            return channel;
          },
          subscribe() {
            realtime.subscribed += 1;
            return channel;
          },
        };
        return channel;
      },
      removeChannel(channel: { name: string }) {
        realtime.removed.push(channel.name);
        return Promise.resolve("ok");
      },
    };
  },
}));

afterEach(() => realtime.reset());

function liveRegionProps(overrides?: Partial<LiveRegionProps>): LiveRegionProps {
  return {
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    tables: ["pages"],
    ...overrides,
  };
}

describe("watching for changes the badge made", () => {
  it("opens one channel named for the tables it watches", () => {
    render(<LiveRegion {...liveRegionProps({ tables: ["pages", "connections"] })} />);

    expect(realtime.channelNames).toEqual(["live:pages,connections"]);
    expect(realtime.subscribed).toBe(1);
  });

  it("connects with the credentials the server component handed down", () => {
    render(<LiveRegion {...liveRegionProps()} />);

    expect(realtime.credentials).toEqual([
      { url: "https://project.supabase.co", key: "sb_publishable_test" },
    ]);
  });

  it("watches every table it was given, for any kind of change", () => {
    render(<LiveRegion {...liveRegionProps({ tables: ["pages", "connections", "badges"] })} />);

    expect(realtime.watches.map((watch) => watch.table)).toEqual([
      "pages",
      "connections",
      "badges",
    ]);
    expect(realtime.watches.map((watch) => watch.event)).toEqual([
      "postgres_changes:*",
      "postgres_changes:*",
      "postgres_changes:*",
    ]);
  });

  it("watches only the public schema, where the row-level policies live", () => {
    render(<LiveRegion {...liveRegionProps()} />);

    expect(realtime.watches.every((watch) => watch.schema === "public")).toBe(true);
  });

  it("subscribes even when it is given no tables to watch", () => {
    render(<LiveRegion {...liveRegionProps({ tables: [] })} />);

    expect(realtime.watches).toHaveLength(0);
    expect(realtime.subscribed).toBe(1);
  });
});

describe("what happens when a watched table changes", () => {
  it("refetches the page rather than patching the change in", () => {
    render(<LiveRegion {...liveRegionProps()} />);

    act(() => realtime.watches[0]?.fire());

    expect(realtime.refreshed).toBe(1);
  });

  it("refetches once for each change, whichever table it came from", () => {
    render(<LiveRegion {...liveRegionProps({ tables: ["pages", "connections"] })} />);

    act(() => {
      for (const watch of realtime.watches) watch.fire();
      realtime.watches[0]?.fire();
    });

    expect(realtime.refreshed).toBe(3);
  });

  it("adds nothing to the page it watches", () => {
    const { container } = render(<LiveRegion {...liveRegionProps()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("leaving a page that was being watched", () => {
  it("closes the channel, so a background tab stops refetching", () => {
    const { unmount } = render(<LiveRegion {...liveRegionProps({ tables: ["pages"] })} />);

    unmount();

    expect(realtime.removed).toEqual(["live:pages"]);
  });

  it("opens a fresh channel when the watched tables change", () => {
    const { rerender } = render(<LiveRegion {...liveRegionProps({ tables: ["pages"] })} />);

    rerender(<LiveRegion {...liveRegionProps({ tables: ["connections"] })} />);

    expect(realtime.removed).toEqual(["live:pages"]);
    expect(realtime.channelNames).toEqual(["live:pages", "live:connections"]);
  });
});
