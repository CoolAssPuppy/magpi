import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageCarousel, type CarouselPage } from "@/components/page-carousel";
import { opsFor } from "@/lib/preview/fixtures";

function page(overrides: Partial<CarouselPage> = {}): CarouselPage {
  return {
    number: "01",
    name: "Next thing",
    source: "Google Calendar",
    slug: "next_thing",
    ops: opsFor("next_thing"),
    ...overrides,
  };
}

const PAGES: CarouselPage[] = [
  page(),
  page({ number: "02", name: "Day shape", slug: "day_shape", ops: opsFor("day_shape") }),
  page({ number: "03", name: "Deploy state", slug: "deploys", ops: opsFor("deploys") }),
];

afterEach(() => {
  vi.useRealTimers();
});

/** The row the carousel says it is showing. */
function currentRow(): HTMLElement {
  const rows = screen.getAllByRole("button");
  const showing = rows.find((row) => row.getAttribute("aria-current") === "true");
  if (!showing) throw new Error("no row is marked as showing");
  return showing;
}

describe("the page carousel", () => {
  it("lists every page the badge can draw", () => {
    render(<PageCarousel pages={PAGES} />);

    for (const entry of PAGES) {
      expect(screen.getByText(entry.name)).toBeInTheDocument();
    }
  });

  it("starts on the first page and says which one that is", () => {
    render(<PageCarousel pages={PAGES} />);

    expect(within(currentRow()).getByText("Next thing")).toBeInTheDocument();
    expect(screen.getByText("Showing Next thing.")).toBeInTheDocument();
  });

  it("shows the badge screen for the page it is on", () => {
    render(<PageCarousel pages={PAGES} />);

    expect(screen.getByRole("img", { name: "Next thing, on the badge" })).toBeInTheDocument();
  });

  it("turns the badge to a page when that row is chosen", async () => {
    const user = userEvent.setup();
    render(<PageCarousel pages={PAGES} />);

    await user.click(screen.getByText("Deploy state"));

    expect(within(currentRow()).getByText("Deploy state")).toBeInTheDocument();
    expect(screen.getByText("Showing Deploy state.")).toBeInTheDocument();
  });

  it("marks exactly one row as showing, so the lit rail cannot appear twice", async () => {
    const user = userEvent.setup();
    render(<PageCarousel pages={PAGES} />);
    await user.click(screen.getByText("Day shape"));

    const marked = screen.getAllByRole("button").filter((row) => row.ariaCurrent === "true");
    expect(marked).toHaveLength(1);
  });

  it("cycles on its own, so the section moves without being touched", () => {
    vi.useFakeTimers();
    render(<PageCarousel pages={PAGES} />);

    expect(screen.getByText("Showing Next thing.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3600));
    expect(screen.getByText("Showing Day shape.")).toBeInTheDocument();
  });

  it("wraps around rather than stopping at the last page", () => {
    vi.useFakeTimers();
    render(<PageCarousel pages={PAGES} />);

    act(() => vi.advanceTimersByTime(3600 * PAGES.length));
    expect(screen.getByText("Showing Next thing.")).toBeInTheDocument();
  });

  it("stops cycling once a row is chosen, so it never moves under a reader", async () => {
    const user = userEvent.setup();
    render(<PageCarousel pages={PAGES} />);
    await user.click(screen.getByText("Deploy state"));

    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(3600 * 3));

    expect(screen.getByText("Showing Deploy state.")).toBeInTheDocument();
  });

  it("announces the change, so it is not visual only", () => {
    render(<PageCarousel pages={PAGES} />);

    const live = screen.getByText("Showing Next thing.");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("does not start a timer for a single page", () => {
    vi.useFakeTimers();
    render(<PageCarousel pages={[page()]} />);

    act(() => vi.advanceTimersByTime(3600 * 4));
    expect(screen.getByText("Showing Next thing.")).toBeInTheDocument();
  });

  it("keeps every page mounted, so a swap does not restart the replay", () => {
    render(<PageCarousel pages={PAGES} />);

    // One image per page, all present; only the current one is shown.
    expect(screen.getAllByRole("img", { hidden: true })).toHaveLength(PAGES.length);
  });
});
