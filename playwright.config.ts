import { defineConfig, devices } from '@playwright/test';

/**
 * A short explicit TEST_RUN_ID per local run. Reusing a default identity on a
 * persistent local database collides with a previous signup before the journey
 * reaches the behavior under test.
 */
const runId = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);

export default defineConfig({
  testDir: './tests',
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
    env: { TEST_RUN_ID: runId },
  },
});
