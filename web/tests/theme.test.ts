import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  isTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from "@/lib/theme";

/**
 * Run the inlined head script the way the browser does, against whatever this
 * test put in storage. Nothing else proves the script and the token layer agree
 * about which attribute values exist.
 */
function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT).call(globalThis);
}

function root(): HTMLElement {
  return document.documentElement;
}

afterEach(() => {
  window.localStorage.clear();
  root().removeAttribute("data-theme");
});

describe("the themes on offer", () => {
  it("are light, dark, and following the system", () => {
    expect([...THEMES]).toEqual(["light", "dark", "system"]);
  });

  it("recognises each one as a choice that can be stored", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
  });

  it("refuses a value that is not one of them", () => {
    expect(isTheme("midnight")).toBe(false);
    expect(isTheme("")).toBe(false);
  });

  it("refuses a stored value that is not a string at all", () => {
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
    expect(isTheme({ theme: "dark" })).toBe(false);
  });
});

describe("applying a choice to the page", () => {
  it("writes the choice the token layer reads", () => {
    applyTheme(root(), "dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("replaces an earlier choice rather than adding to it", () => {
    applyTheme(root(), "dark");
    applyTheme(root(), "light");
    expect(root()).toHaveAttribute("data-theme", "light");
  });

  // Writing data-theme="system" would pin the page to light on a dark OS,
  // because the dark block is guarded on the attribute being absent or dark.
  it("takes the attribute off when the wearer wants to follow the system", () => {
    applyTheme(root(), "dark");
    applyTheme(root(), "system");
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("leaves an unthemed page unthemed when the choice is already the system", () => {
    applyTheme(root(), "system");
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("themes an element other than the document root", () => {
    const panel = document.createElement("div");
    applyTheme(panel, "light");
    expect(panel).toHaveAttribute("data-theme", "light");
  });
});

describe("the script that runs before first paint", () => {
  it("applies a stored light choice, so a dark OS does not flash", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    expect(root()).toHaveAttribute("data-theme", "light");
  });

  it("applies a stored dark choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("leaves the page to the system when nothing is stored", () => {
    runInitScript();
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("leaves the page to the system when the stored choice is to follow it", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    runInitScript();
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("ignores a stored value it does not understand", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "midnight");
    runInitScript();
    expect(root()).not.toHaveAttribute("data-theme");
  });

  it("renders the page rather than failing when site data is blocked", () => {
    const blocked = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    expect(() => runInitScript()).not.toThrow();
    expect(root()).not.toHaveAttribute("data-theme");
    blocked.mockRestore();
  });

  it("reads the same key the toggle writes", () => {
    const chosen: Theme = "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, chosen);
    runInitScript();
    expect(root().getAttribute("data-theme")).toBe(chosen);
  });
});
