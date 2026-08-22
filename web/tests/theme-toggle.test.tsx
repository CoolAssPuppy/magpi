import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function chosenOption(): string | null {
  const checked = screen
    .getAllByRole("radio")
    .find((option) => option.getAttribute("aria-checked") === "true");
  return checked ? checked.textContent : null;
}

describe("the theme control on first arrival", () => {
  it("follows the operating system when nobody has chosen", () => {
    render(<ThemeToggle />);

    expect(chosenOption()).toBe("Auto");
  });

  it("offers all three states from wherever the reader is", () => {
    render(<ThemeToggle />);

    expect(screen.getAllByRole("radio").map((option) => option.textContent)).toEqual([
      "Light",
      "Dark",
      "Auto",
    ]);
  });

  it("names itself, so the three buttons are not three unexplained words", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });
});

describe("the theme control when a choice was made on an earlier visit", () => {
  it("shows light as chosen when light was stored", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    expect(chosenOption()).toBe("Light");
  });

  it("shows dark as chosen when dark was stored", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    expect(chosenOption()).toBe("Dark");
  });

  it("falls back to following the system when the stored value is not a theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    render(<ThemeToggle />);

    expect(chosenOption()).toBe("Auto");
  });

  it("falls back to following the system in a window where site data is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    render(<ThemeToggle />);

    expect(chosenOption()).toBe("Auto");
  });
});

describe("choosing a theme", () => {
  it("puts the page in dark and remembers it for the next visit", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(chosenOption()).toBe("Dark");
  });

  it("cycles through every state and leaves the page matching the last one", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(chosenOption()).toBe("Light");

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(chosenOption()).toBe("Dark");

    await user.click(screen.getByRole("radio", { name: "Auto" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(chosenOption()).toBe("Auto");
  });

  it("hands the page back to the system when auto is chosen after dark", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Auto" }));

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("still applies the choice to this page when it cannot be stored", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Light" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});

describe("the theme control across tabs and renders", () => {
  it("moves when another tab changes the choice", () => {
    render(<ThemeToggle />);
    expect(chosenOption()).toBe("Auto");

    act(() => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });

    expect(chosenOption()).toBe("Dark");
  });

  it("keeps two controls on the same page in step", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );

    const [firstDark] = screen.getAllByRole("radio", { name: "Dark" });
    if (!firstDark) throw new Error("no dark option was rendered");
    await user.click(firstDark);

    expect(
      screen.getAllByRole("radio", { name: "Dark" }).map((o) => o.getAttribute("aria-checked")),
    ).toEqual(["true", "true"]);
  });

  it("renders on the server as auto, because the server cannot know the choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const markup = renderToStaticMarkup(<ThemeToggle />);

    expect(markup).toMatch(/aria-checked="true"[^>]*>Auto</);
    expect(markup).toMatch(/aria-checked="false"[^>]*>Dark</);
  });
});
