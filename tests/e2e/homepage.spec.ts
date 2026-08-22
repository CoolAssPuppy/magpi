import { expect, test } from "@playwright/test";

test.describe("the homepage", () => {
  test("opens with what the product is", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A bird that watches your whole day.",
    );
  });

  test("offers a way in", async ({ page }) => {
    await page.goto("/");

    // A button, not a link: there is no sign-in page, so it submits straight to GitHub.
    await expect(page.getByRole("button", { name: /sign in with github/i })).toBeVisible();
  });

  test("explains the pages and the privacy claim", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Every page at a glance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your data, on your device." })).toBeVisible();
  });

  test("names every app it can read from", async ({ page }) => {
    await page.goto("/");

    for (const provider of ["Google", "Linear", "Slack", "Notion", "GitHub", "Vercel", "PostHog"]) {
      await expect(page.getByText(provider, { exact: true }).first()).toBeVisible();
    }
  });

  test("shows the badge preview rather than describing it", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("svg").first()).toBeVisible();
  });

  test("never scrolls sideways, at any width", async ({ page }) => {
    await page.goto("/");

    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `page scrolls sideways at ${width}px`).toBe(false);
    }
  });

  test("gives every link an accessible name, so a screen reader is not read a url", async ({
    page,
  }) => {
    await page.goto("/");

    const unnamed = await page.evaluate(
      () =>
        [...document.querySelectorAll("a")].filter(
          (link) =>
            !(link.textContent ?? "").trim() &&
            !link.getAttribute("aria-label") &&
            !link.querySelector("[aria-label], title"),
        ).length,
    );
    expect(unnamed).toBe(0);
  });

  test("has exactly one first-level heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});
