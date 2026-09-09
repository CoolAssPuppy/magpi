import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against the real local stack, so they get their own
 * config: node environment, no jsdom, longer timeouts, and one worker. Browser
 * suites that create accounts run separately, because concurrent fixtures on one
 * persistent database produce false cleanup failures.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    isolate: true,
  },
});
