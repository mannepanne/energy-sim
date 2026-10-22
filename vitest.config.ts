// ABOUT: Vitest configuration for unit tests and V8 coverage
// ABOUT: Coverage covers all source and script modules, so untested files count against the thresholds

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'site/src/**/*.test.ts'],
    // Tests that run the real register (the report, the archetype table, the SPF checks) take
    // under a second locally but have been seen to take several times longer on CI runners
    // under coverage, past Vitest's 5-second default. They are deterministic, so a longer
    // limit can't hide a wrong answer.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/**/*.ts', 'site/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        // Command-line entry points sit at the top of scripts/ and stay thin: they wire up
        // file reads and printing. The logic they call lives in tested modules in subfolders.
        'scripts/*.ts',
        // The web worker entry only relays messages to the tested modules it imports.
        'site/src/*.worker.ts',
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
