import { defineConfig, devices } from '@playwright/test';

/**
 * A short explicit TEST_RUN_ID per local run. Reusing a default identity on a
 * persistent local database collides with a previous signup before the journey
 * reaches the behavior under test.
 */
const runId = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);

export default defineConfig({
  testDir: './tests',
  // The integration suite is vitest and lives under tests/ too. Browser suites
  // that create accounts run separately from database suites, because concurrent
  // fixtures on one persistent database produce false cleanup failures.
  testIgnore: ['integration/**'],
  // Takes the lock the integration runner takes, and releases it on the way out.
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --dir web dev --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Spread process.env. Playwright replaces the child environment with this
    // object rather than merging, so a bare { TEST_RUN_ID } starts the dev
    // server with no Supabase keys and every sign-in silently does nothing.
    env: { ...process.env, TEST_RUN_ID: runId },
  },
});
