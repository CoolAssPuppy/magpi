import { expect, test } from "@playwright/test";

const STORAGE_KEY = "magpi-theme";

/** The toggle lives in the homepage footer, which needs no account. */
const PAGE = "/";

async function storedTheme(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

async function rootTheme(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

test.describe("choosing a theme", () => {
  test("starts on auto, following the operating system", async ({ page }) => {
    await page.goto(PAGE);

    await expect(page.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(await rootTheme(page)).toBeNull();
  });

  test("applies a choice to the page at once", async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "Dark" }).click();

    expect(await rootTheme(page)).toBe("dark");
    await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  test("remembers the choice across a reload, with no flash of the wrong theme", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "Light" }).click();
    expect(await storedTheme(page)).toBe("light");

    await page.reload();

    // Read before any script this test runs: the inlined init script has
    // already set it, which is what stops the flash.
    expect(await rootTheme(page)).toBe("light");
    await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("carries the choice to another page", async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "Dark" }).click();

    await page.goto("/?next=%2Fsettings");

    expect(await rootTheme(page)).toBe("dark");
  });

  test("drops the attribute when going back to auto, so the system wins again", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "Dark" }).click();
    await page.getByRole("radio", { name: "Auto" }).click();

    expect(await rootTheme(page)).toBeNull();
    expect(await storedTheme(page)).toBe("system");
  });

  test("is reachable and operable from the keyboard alone", async ({ page }) => {
    await page.goto(PAGE);
    const dark = page.getByRole("radio", { name: "Dark" });

    await dark.focus();
    await page.keyboard.press("Enter");

    expect(await rootTheme(page)).toBe("dark");
  });

  test("is announced as one group of choices", async ({ page }) => {
    await page.goto(PAGE);

    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio")).toHaveCount(3);
  });
});

test.describe("a visitor whose browser blocks site data", () => {
  test("still gets a working page, on the default theme", async ({ browser }) => {
    const context = await browser.newContext();
    // Every localStorage call throws, which is what a locked-down browser does.
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("site data is blocked");
        },
      });
    });
    const page = await context.newPage();

    await page.goto(PAGE);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A bird that watches your whole day.",
    );
    await expect(page.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    await context.close();
  });
});
