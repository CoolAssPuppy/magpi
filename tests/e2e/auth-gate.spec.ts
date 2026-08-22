import { expect, test } from "@playwright/test";

const PRIVATE = ["/dashboard", "/pages", "/connections", "/link", "/settings"];

test.describe("pages that need an account", () => {
  for (const path of PRIVATE) {
    test(`sends a stranger from ${path} to sign in`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/\?next=/);
      await expect(page.getByRole("button", { name: /sign in with github/i })).toBeVisible();
    });
  }

  test("remembers where they were going", async ({ page }) => {
    await page.goto("/connections?provider=google");

    expect(new URL(page.url()).searchParams.get("next")).toBe("/connections?provider=google");
  });

  test("keeps the query string, so a scanned pairing code is not thrown away", async ({ page }) => {
    await page.goto("/link?code=K4RN-92");

    expect(new URL(page.url()).searchParams.get("next")).toBe("/link?code=K4RN-92");
  });

  test("never shows a stranger anything from an account", async ({ page }) => {
    await page.goto("/dashboard");

    // The word "badge" is all over the homepage, so the tell is the account
    // chrome: the section nav and the way out of an account nobody is in.
    await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign in with github/i })).toBeVisible();
  });
});

test.describe("signing in, from the homepage", () => {
  test("offers GitHub, and nothing else", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: /github/i })).toBeVisible();

    // No second way in. A magic link is a second account for the same person
    // and a mailbox to babysit.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByText(/magic link/i)).toHaveCount(0);
  });

  test("refuses to bounce the caller off to another site", async ({ page }) => {
    await page.goto("/?next=https://evil.example/steal");

    // The offsite value is dropped, so signing in lands on the dashboard. The
    // raw url still appears in the router payload, which is Next echoing the
    // request path rather than this page trusting it; what matters is the value
    // the form will actually submit.
    const destinations = await page
      .locator('input[name="next"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

    expect(destinations.length).toBeGreaterThan(0);
    for (const destination of destinations) expect(destination).toBe("/dashboard");
  });

  test("explains a failed sign in instead of showing a blank form", async ({ page }) => {
    await page.goto("/?error=exchange");

    await expect(page.getByRole("main").getByRole("alert")).toContainText("already been used");
  });

  test("ignores an error code it does not recognise", async ({ page }) => {
    await page.goto("/?error=not-a-real-error");

    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
});
