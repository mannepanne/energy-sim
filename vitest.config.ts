// ABOUT: Vitest configuration for unit tests and V8 coverage
// ABOUT: Coverage covers all source and script modules, so untested files count against the thresholds

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Tests that run the real register (the report, the archetype table, the SPF check) take
    // under a second locally but up to about seven times longer on CI runners under coverage,
    // which is past Vitest's 5-second default. They are deterministic, so a longer limit can't
    // hide a wrong answer.
    testTimeout: 30_000,
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
