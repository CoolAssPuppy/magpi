import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['{app,components,hooks,lib,test}/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Without this the run prints no coverage at all when a test fails, so a
      // red suite hides how far the number moved.
      reportOnFailure: true,
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['app/**', 'components/**', 'hooks/**', 'lib/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'lib/database.types.ts',
        '**/*.d.ts',
        // Async server components. Vitest has no RSC runtime, so a test here
        // could only assert that a function returns a promise. The Playwright
        // journeys render these for real against a real database, which is the
        // tier that can actually answer whether a page works.
        'app/**/page.tsx',
        'app/**/layout.tsx',
        'app/**/error.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
        // Vendored shadcn primitives. They carry no logic of ours: the parts we
        // changed are the token classes, and the check that those are right is
        // scripts/check-raw-color.mjs, not a render assertion.
        'components/ui/**',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
