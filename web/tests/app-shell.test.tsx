import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, NAV_ITEMS, Sidebar, type AppShellProps } from "@/components/app-shell";

function appShellProps(overrides?: Partial<AppShellProps>): AppShellProps {
  return {
    current: "/dashboard",
    title: "Dashboard",
    children: <p>Six pages, all polling.</p>,
    ...overrides,
  };
}

describe("the section sidebar", () => {
  it("lists every section of the product", () => {
    render(<Sidebar current="/dashboard" />);
    const links = within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(NAV_ITEMS.map((item) => item.label));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      NAV_ITEMS.map((item) => item.href),
    );
  });

  it("marks the section being read, and only that one", () => {
    render(<Sidebar current="/connections" />);
    const links = screen.getAllByRole("link");
    const current = links.filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Connections");
  });

  it("gives the current section a lit glyph and the rest a quiet one", () => {
    const { container } = render(<Sidebar current="/settings" />);
    const settings = screen.getByRole("link", { name: "Settings" });

    expect(settings.querySelector("path")).toHaveAttribute("fill", "var(--color-accent)");
    expect(container.querySelectorAll('path[fill="var(--color-border-strong)"]')).toHaveLength(
      NAV_ITEMS.length - 1,
    );
  });

  it("carries the wordmark and the product name", () => {
    render(<Sidebar current="/connections" />);

    expect(screen.getByText("Magpi")).toBeInTheDocument();
  });
});

describe("the page frame around every signed-in screen", () => {
  it("names the page in the only first-level heading", () => {
    render(<AppShell {...appShellProps({ title: "Connections" })} />);

    expect(screen.getByRole("heading", { level: 1, name: "Connections" })).toBeInTheDocument();
  });

  it("shows the page content in the main landmark", () => {
    render(<AppShell {...appShellProps()} />);

    expect(
      within(screen.getByRole("main")).getByText("Six pages, all polling."),
    ).toBeInTheDocument();
  });

  it("shows a status beside the title when the page reports one", () => {
    render(<AppShell {...appShellProps({ status: <span>WAITING FOR THE BADGE</span> })} />);

    expect(screen.getByText("WAITING FOR THE BADGE")).toBeInTheDocument();
  });

  it("leaves the status slot empty when the page has nothing to report", () => {
    render(<AppShell {...appShellProps()} />);

    expect(screen.queryByText("WAITING FOR THE BADGE")).not.toBeInTheDocument();
  });

  it("offers sign out as a post, so no link preloader can trigger it", () => {
    render(<AppShell {...appShellProps()} />);
    const form = screen.getByRole("button", { name: "Sign out" }).closest("form");

    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/sign-out");
  });

  it("puts the theme control on every page it frames", () => {
    render(<AppShell {...appShellProps()} />);

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });

  it("keeps the sidebar in step with the page being framed", () => {
    render(<AppShell {...appShellProps({ current: "/settings", title: "Settings" })} />);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("puts the theme choice and signing out at the foot of the sidebar", () => {
    render(
      <AppShell current="/dashboard" title="Dashboard">
        <p>content</p>
      </AppShell>,
    );

    // Not in the header: they are account controls, not page controls, so they
    // belong with the sections rather than beside the page title.
    const sidebar = within(screen.getByRole("navigation", { name: "Sections" }));
    expect(sidebar.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(sidebar.getByRole("button", { name: "Sign out" })).toBeInTheDocument();

    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(header).queryByRole("radiogroup", { name: "Theme" })).toBeNull();
  });
});
