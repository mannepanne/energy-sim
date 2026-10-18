# ADR: One typed, validated parameter register

**Date:** 2026-10-17
**Status:** Active
**Supersedes:** N/A

---

## Decision

Every input the engine uses lives in one data file, `data/register.json`. Each row is one parameter, of one of four typed kinds: `uncertain`, `fixed`, `series` or `profile`. A Zod schema validates the file on load. The schema enforces provenance on every row: either a source or, for `approximate` rows, a written rationale. It also enforces integrity rules: unique ids, valid ranges, valid dependencies and ISO dates. The engine reads parameters only through a typed accessor. Only physical constants, unit conversions and method settings live in code (see the amendment below).

## Context

The project's trust promise is that "every number has a source, a range and a last-checked date, and the user can override it." The register is how that promise is kept. It has to:

- hold different shapes of input: scalars with uncertainty, fixed scalars such as quarterly price-cap rates, references to large hourly snapshots, and short profiles such as a daily pattern;
- allow honest "best estimate" rows, because some inputs have no good published source yet;
- be readable by the engine, the report and, later, the UI's "where does this number come from?" view;
- fail loudly when a row is incomplete, so missing provenance can't slip in.

The first draft used one flat row shape with `default`/`low`/`high`, and required a source and a range on every row. The spec review found it couldn't represent curves, snapshots or fixed rates, and that it forced invented sources onto engineering estimates.

## Alternatives considered

- **Constants in code, with comments for sources:**
  - Why not: the provenance can't be checked or shown in the UI, and numbers end up scattered across files.
- **One flat row shape for everything:**
  - Why not: it can't hold series or profiles, and it forces fake ranges and fake sources.
- **A database or a CMS:**
  - Why not: there is no server ([client-side ADR](./2026-10-17-client-side-build-time-snapshots.md)), and changes would lose git history and review.
- **One register per section** (weather, fabric, heating and so on):
  - Why not: it splits the single source of truth agreed in the model spec. Sections are a field on each row instead, so views can still group by section.
- **One file of typed rows, validated with Zod:**
  - **Chosen:** each kind carries exactly the fields it needs, provenance is enforced, and the file is diffable and reviewable in PRs.

## Reasoning

**Trust is enforced, not just intended:**
- A row can't exist without a source or a rationale.
- `approximate` rows are honest about being estimates, and the UI can show them differently.
- The id parity test and the throwing accessor mean the engine can't use an unregistered number.

**One loader for every consumer:**
- The loader validates an already-parsed object and does no file I/O, so the same code runs in tests, scripts and the browser.

**Change is safe and visible:**
- Every value change is a reviewed diff with its new source and date.
- Refresh cadences let the report warn when data is stale.

## Trade-offs accepted

**A larger schema to maintain:**
- Four kinds, provenance variants and integrity rules are more than a flat table.
- Accepted: each rule exists because the review found a concrete failure without it.

**A hand-maintained id union:**
- The TypeScript `RowId` union duplicates the ids in the JSON.
- Accepted: a parity test keeps them in step, and in return every read is type-checked.

**JSON is less pleasant to edit than a spreadsheet:**
- Accepted for now. A CSV or spreadsheet import could feed the same schema later if non-developers start maintaining values.

## Implications

**Enables:**
- The UI's "where does this number come from?" view, read straight from the register.
- User overrides, which replace a row's value and are flagged as "your figure".
- Expert review row by row, with comments logged against row ids.

**Prevents or complicates:**
- Ad hoc constants in engine code. Physical constants (in `src/engine/constants.ts`) and method settings are the only exemptions; see the amendment below.
- Adding a new input always means adding a row with provenance first. That is intentional friction.

## Amendment (18 October 2026): method settings may live in code

**Decision (Magnus, while reviewing the phase 1 ranges-and-report PR):** two kinds of number may live in code:
- physical constants and unit conversions;
- **method settings**: numbers that say how the calculation is carried out, not what is true of a house. Examples are the report's sampling plan (seed 1, 500 samples), the sensitivity table's tie threshold, the coefficients of the inverse normal approximation and the hash constants.

Every fact about houses, energy, prices or behaviour stays in the register, with its source and date.

**Why:** a method setting has no source to cite and no range to sample. Putting it in the register would break the register's rule that each row is a sourced fact. Each method setting sits next to the code that uses it, with a comment saying what it is.

---

## References

- [Phase 1 spec](../../SPECIFICATIONS/01-engine-core.md), "Register schema" and "Register integrity"
- [Model and register spec](../../SPECIFICATIONS/ORIGINAL_IDEA/home-energy-simulator-spec.md), "How the register works"
- [Zod documentation](https://zod.dev/)
