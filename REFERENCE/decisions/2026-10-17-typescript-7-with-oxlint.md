# ADR: TypeScript 7 with Oxlint for linting

**Date:** 2026-10-17
**Status:** Active
**Supersedes:** N/A

---

## Decision

The project uses TypeScript 7 for type checking and Oxlint for linting. Oxlint's type-aware rules run through its `oxlint-tsgolint` plugin. ESLint and typescript-eslint are not used.

TypeScript is pinned to an exact version (7.0.2), because each `oxlint-tsgolint` release is built against one TypeScript version. The two are upgraded together.

## Context

Phase 1 needs a type checker and a linter. TypeScript 7.0.2 is the latest release. It is the native rewrite of the compiler, and it no longer offers the JavaScript programming interface that older tools read code through.

The usual linter, ESLint with typescript-eslint, depends on that interface. typescript-eslint 8.71 supports TypeScript below 6.1 only, so using it would hold the project on TypeScript 6.0.

Oxlint's type-aware linting became stable in July 2026. It is built on TypeScript 7's native compiler and covers 59 of typescript-eslint's 61 type-aware rules.

The first version of PR 3 used TypeScript 6.0 with ESLint. Magnus chose to move to TypeScript 7 during review.

## Alternatives considered

- **TypeScript 6.0 with ESLint and typescript-eslint:**
  - Why not: it holds the project on an older compiler until typescript-eslint supports TypeScript 7. That would mean a forced migration later, probably mid-phase.
- **TypeScript 7 with Biome:**
  - Why not: Biome doesn't run TypeScript's own type checker, so it misses most type-aware rules (unsafe `any`, unhandled promises).
- **TypeScript 7 with no linter:**
  - Why not: the spec asks for linting in CI, and type-aware rules catch real bugs that the compiler allows.
- **TypeScript 7 with Oxlint and oxlint-tsgolint:**
  - **Chosen:** it is the latest compiler, has nearly all the type-aware rules, needs fewer dependencies than ESLint, and runs faster.

## Reasoning

**The latest stable tools, without giving up type-aware rules:**
- TypeScript 7 is the current release; the project's technology preferences favour the latest stable versions.
- Oxlint enables the same type-aware rules as typescript-eslint's `recommended-type-checked` set (listed in `oxlint.config.ts`), plus its own correctness and suspicious rule categories.

**Fewer dependencies:**
- The lint toolchain is two packages, `oxlint` and `oxlint-tsgolint`, instead of four (ESLint, `@eslint/js`, typescript-eslint and globals).

**Checked in practice:**
- Type checking, lint and tests all pass on TypeScript 7.0.2. A test file with an unsafe `any`, an unhandled promise and an object in a template string produced the expected type-aware errors.

## Trade-offs accepted

**A younger tool:**
- Oxlint's type-aware linting has been stable only since July 2026, and its plugin ecosystem is smaller than ESLint's.
- Accepted: the project needs only the core TypeScript rules, and switching back to ESLint later would be a config change, not a code change.

**Two rules missing:**
- Oxlint has 59 of typescript-eslint's 61 type-aware rules.
- Accepted: the rules the project uses are all available.

**Versions move together:**
- `typescript` and `oxlint-tsgolint` must be upgraded as a pair. Dependabot groups them for that reason.
- Accepted: it is one grouped pull request per TypeScript release.

**Type checking stays with `tsc`:**
- Oxlint can also report compiler errors (`--type-check`), but that feature is marked experimental. `npm run typecheck` uses `tsc --noEmit` instead.

## Implications

**Enables:**
- The latest TypeScript from the start of the project, with no migration pending.
- Fast lint runs in CI.

**Prevents/complicates:**
- ESLint plugins (for example, framework-specific rules in phase 3) can't be added directly. If phase 3 needs one, Oxlint's JavaScript plugin support or a small ESLint run alongside are the options.
- Revisit this decision if Oxlint's type-aware support stalls, or if a phase 3 framework requires ESLint.

---

## References

- [Oxlint type-aware linting guide](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [Oxlint: type-aware linting is stable (July 2026)](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable)
- Project configuration: `oxlint.config.ts`, `tsconfig.json`, `.github/dependabot.yml`
