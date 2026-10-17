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
        // Command-line entry points sit at the top of scripts/ and stay thin: they wire up
        // file reads and printing. The logic they call lives in tested modules in subfolders.
        'scripts/*.ts',
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
