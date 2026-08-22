import { expect, test } from "@playwright/test";

test.describe("the headers every response carries", () => {
  test("sets a content security policy with a per-request nonce", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};

    const nonce = headers["x-nonce"];
    expect(nonce).toBeTruthy();
    expect(headers["content-security-policy"]).toContain(`'nonce-${nonce}'`);
  });

  test("uses a different nonce each time, so one page's scripts cannot run in another", async ({
    page,
  }) => {
    const first = (await page.goto("/"))?.headers()["x-nonce"];
    const second = (await page.goto("/?again=1"))?.headers()["x-nonce"];

    expect(first).not.toBe(second);
  });

  test("refuses framing, sniffing, and plugins", async ({ page }) => {
    const headers = (await page.goto("/"))?.headers() ?? {};

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
  });

  test("limits what the page may connect to", async ({ page }) => {
    const csp = (await page.goto("/"))?.headers()["content-security-policy"] ?? "";
    const connect = csp.split("; ").find((part) => part.startsWith("connect-src")) ?? "";

    expect(connect).toContain("'self'");
    expect(connect).not.toContain("*");
  });

  test("turns off the device permissions this product never asks for", async ({ page }) => {
    const headers = (await page.goto("/"))?.headers() ?? {};

    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
  });

  test("asks browsers to stay on https", async ({ page }) => {
    const headers = (await page.goto("/"))?.headers() ?? {};

    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  });

  test("loads the page with no console error, so the policy is not blocking its own assets", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });
});
