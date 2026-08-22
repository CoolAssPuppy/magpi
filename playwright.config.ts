import { defineConfig, devices } from "@playwright/test";

// The gate picks a free port and passes it in, because several projects on this
// machine run a dev server and a fixed 3000 would talk to the wrong one.
const port = Number(process.env.PORT) || 3000;

// `localhost`, not `127.0.0.1`: Next's dev server treats the numeric form as a
// cross-origin host and refuses to serve its own client bundle, which leaves
// the page rendered but never interactive.
const baseURL = `http://localhost:${port}`;

// A production build is what ships, and several things under test only exist
// there: the strict policy drops 'unsafe-eval', and dev-only overlays are gone.
const isProd = process.env.E2E_PROD === "true";

/**
 * Values for the build and the server under test.
 *
 * These are the local stack's own, not secrets: the pages this suite visits are
 * the public ones, so nothing here ever authenticates. Spelling them out keeps
 * the run self-contained, so CI needs no vault to check the homepage.
 */
const localStack = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56521",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_placeholder",
  SUPABASE_SECRET_KEY: "sb_secret_e2e_placeholder",
  BADGE_API_URL: "http://127.0.0.1:56521/functions/v1",
  // Analytics off, so no test fires an event at a real project.
  NEXT_PUBLIC_POSTHOG_KEY: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
    { name: "mobile", use: devices["iPhone 13"] },
  ],

  webServer: {
    command: isProd
      ? `pnpm --dir web build && pnpm --dir web exec next start --port ${port}`
      : `pnpm --dir web exec next dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold production build of the whole app is the slow part, not the boot.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: localStack,
  },
});
