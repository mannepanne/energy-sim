// ABOUT: Oxlint configuration: correctness rules plus typescript-eslint's type-aware recommended set
// ABOUT: Type-aware rules run through oxlint-tsgolint, which uses TypeScript 7's native compiler

import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['eslint', 'typescript', 'oxc', 'unicorn', 'import', 'vitest'],
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  env: { node: true, es2024: true },
  ignorePatterns: ['coverage/**', 'node_modules/**', '.claude/**', 'site/out/**', 'site/.next/**', 'site/next-env.d.ts'],
  options: {
    typeAware: true,
  },
  overrides: [
    // The site's pages and worker run in the browser.
    {
      files: ['site/pages/**', 'site/src/**'],
      env: { browser: true, worker: true },
      // The rule is for window.postMessage; a web worker's postMessage takes no target origin.
      rules: { 'unicorn/require-post-message-target-origin': 'off' },
    },
  ],
  rules: {
    // Test helpers whose names start with "expect" make assertions themselves.
    'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*'] }],
    // The type-aware rules in typescript-eslint's recommended-type-checked set.
    'typescript/await-thenable': 'error',
    'typescript/no-array-delete': 'error',
    'typescript/no-base-to-string': 'error',
    'typescript/no-duplicate-type-constituents': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-for-in-array': 'error',
    'typescript/no-implied-eval': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/no-redundant-type-constituents': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-enum-comparison': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-unary-minus': 'error',
    'typescript/only-throw-error': 'error',
    'typescript/prefer-promise-reject-errors': 'error',
    'typescript/require-await': 'error',
    'typescript/restrict-plus-operands': 'error',
    'typescript/restrict-template-expressions': 'error',
    'typescript/unbound-method': 'error',
  },
});
