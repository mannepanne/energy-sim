// ABOUT: Vitest configuration for unit tests and V8 coverage
// ABOUT: Coverage covers all source and script modules, so untested files count against the thresholds

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        // Thin command-line entry points: they only read files and print.
        // The logic they call lives in tested modules.
        'scripts/benchmark/rough-heat-demand.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
    },
  },
});
