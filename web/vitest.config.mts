import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['{app,components,lib,test}/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['app/**', 'components/**', 'lib/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'lib/database.types.ts',
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/**/error.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
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
