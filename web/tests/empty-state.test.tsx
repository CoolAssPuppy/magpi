import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EmptyState,
  ErrorPanel,
  LoadingRows,
  type EmptyStateProps,
  type ErrorPanelProps,
} from "@/components/empty-state";

function emptyStateProps(overrides?: Partial<EmptyStateProps>): EmptyStateProps {
  return {
    kicker: "PAGES",
    heading: "No pages yet",
    body: "Add a page and the badge will start showing it on the next poll.",
    ...overrides,
  };
}

function errorPanelProps(overrides?: Partial<ErrorPanelProps>): ErrorPanelProps {
  return {
    kicker: "SLACK",
    heading: "The connection expired",
    body: "The badge has been showing stale counts since Tuesday.",
    ...overrides,
  };
}

describe("a panel with nothing in it", () => {
  it("says what the panel is, what is missing, and what it would hold", () => {
    render(<EmptyState {...emptyStateProps()} />);

    expect(screen.getByText("PAGES")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    expect(screen.getByText(/Add a page/)).toBeInTheDocument();
  });

  it("names the next step as a link the reader can follow", () => {
    render(<EmptyState {...emptyStateProps({ action: { href: "/pages/new", label: "Add a page" } })} />);

    expect(screen.getByRole("link", { name: "Add a page" })).toHaveAttribute("href", "/pages/new");
  });

  it("shows no action when the caller supplies none", () => {
    render(<EmptyState {...emptyStateProps()} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("makes room for whatever the page wants to put below the copy", () => {
    render(
      <EmptyState {...emptyStateProps()}>
        <p>Or connect a provider first.</p>
      </EmptyState>,
    );

    expect(screen.getByText("Or connect a provider first.")).toBeInTheDocument();
  });
});

describe("a panel reporting a failure", () => {
  it("announces itself, so a reader who has moved on still hears it", () => {
    render(<ErrorPanel {...errorPanelProps()} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("says what failed and what it cost", () => {
    render(<ErrorPanel {...errorPanelProps()} />);

    expect(screen.getByRole("heading", { name: "The connection expired" })).toBeInTheDocument();
    expect(screen.getByText(/stale counts since Tuesday/)).toBeInTheDocument();
  });

  it("reads as a failure unless the caller says the reader can fix it", () => {
    render(<ErrorPanel {...errorPanelProps()} />);

    expect(screen.getByRole("alert").className).toContain("border-critical");
  });

  it("softens to a caution when the reader can fix it in the field", () => {
    render(<ErrorPanel {...errorPanelProps({ tone: "caution" })} />);

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-caution");
    expect(alert.className).not.toContain("border-critical");
  });

  it("offers the fix as a link when there is one", () => {
    render(
      <ErrorPanel {...errorPanelProps({ action: { href: "/connections", label: "Reconnect" } })} />,
    );

    expect(screen.getByRole("link", { name: "Reconnect" })).toHaveAttribute("href", "/connections");
  });

  it("shows no link when nothing can be done from here", () => {
    render(<ErrorPanel {...errorPanelProps()} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

function loadingRowCount(container: HTMLElement): number {
  const panel = container.firstElementChild;
  if (!panel) throw new Error("no placeholder panel was rendered");
  return panel.children.length;
}

describe("the placeholder rows shown while data loads", () => {
  it("holds three rows of layout by default", () => {
    const { container } = render(<LoadingRows />);

    expect(loadingRowCount(container)).toBe(3);
  });

  it("holds as many rows as the page expects to fill", () => {
    const { container } = render(<LoadingRows count={7} />);

    expect(loadingRowCount(container)).toBe(7);
  });

  it("stays out of the accessibility tree, having nothing to say yet", () => {
    const { container } = render(<LoadingRows />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
