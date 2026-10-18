# ADR: One typed, validated parameter register

**Date:** 2026-10-17
**Status:** Active
**Supersedes:** N/A

---

## Decision

Every input the engine uses lives in one data file, `data/register.json`. Each row is one parameter, of one of four typed kinds: `uncertain`, `fixed`, `series` or `profile` (two more, `table` and `correlation`, are added by the amendment below). A Zod schema validates the file on load. The schema enforces provenance on every row: either a source or, for `approximate` rows, a written rationale. It also enforces integrity rules: unique ids, valid ranges, valid dependencies and ISO dates. The engine reads parameters only through a typed accessor. Only physical constants, unit conversions and method settings live in code (see the amendment below).

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

## Amendment (18 October 2026): archetype tables, categorical values, correlations and derived geometry

**Status:** proposed in the phase 2 archetypes PR; awaiting Magnus's confirmation before merge.

**Decision:**
- **Two new row kinds:**
  - **`table`** holds values keyed by a string, such as an archetype, an RdSAP age band, a construction or a quick-facts answer. Its `keyedBy` field says what the keys are. Cells are an array of `{ key, value }`, so a duplicate key is caught (a JSON object would silently keep the last one).
  - **`correlation`** holds one correlation coefficient between two named uncertain rows, for the Gaussian copula.
- **A table cell may be fixed or uncertain.** A fixed cell holds a number or a string. An uncertain cell has the same fields and checks as an uncertain row. It is sampled with the hash key `rowId|key`, so adding cells never moves other draws. Keys may not contain `|`.
- **Categorical facts are string cells.** House type, construction, ground floor construction and the default quick-facts answers are examples. The engine checks each one against its list of allowed values and throws on an unknown one.
- **Element areas and heated volume leave the register.** The engine derives them from floor area, storeys, footprint shape and party walls. The ground floor U-value is computed in the engine by BS EN ISO 13370 from register parameters. The derived rows, `fabric.roofUValueNoLoftInsulation`, `gains.internalGains` and `hotWater.litresPerDay` are removed. The parity test keeps them out.
- **Schema additions:**
  - the sections `archetypes`, `solar`, `costs` and `tariffs`;
  - an `hour-of-week` profile resolution of 168 values, starting Monday 00:00 local time.
- **The accessor** reads cells with `cell`, `cellNumber` and `cellString`. Each throws an error naming the row and the key if the key is missing, the cell is uncertain where a fixed one is asked for, or the type is wrong.
- **Parity:** a test checks that every archetype-keyed table holds exactly the `ARCHETYPE_KEYS` union, and that every band-keyed table holds exactly the bands the archetypes use.
- **Correlation rules:**
  - the value lies strictly between −1 and 1, in normal-score space;
  - both named rows exist, are uncertain rows, and appear in `dependsOn`;
  - a row may be in one correlation only.

  The first row named is the anchor and keeps its own draw.

**Why:**
- **Tables keep one fact per row.** Ten archetypes, eight age bands and three quick-facts questions would otherwise need hundreds of scalar rows, each repeating the same source. One table row cites RdSAP 10 Table 6 once, with every cell from that table.
- **String keys and the `rowId|key` hash keep draws stable**, as the phase 1 rule requires for rows.
- **Deriving geometry settles the phase 3 override question.** A visitor's floor area now flows through to every area and to the volume, because nothing derived is stored.
- **A separate correlation kind makes the pairs visible and checkable.** It does not hide correlation inside a row's own fields.

**Alternatives considered:**
- **Scalar rows named by key** (such as `fabric.wallUValue.C.cavity.asBuilt`): rejected, because it gives hundreds of ids, repeats every source, and leaves no place to check that a table is complete.
- **Cells as a JSON object keyed by name:** rejected, because a duplicate key would be lost silently.
- **Correlation as a field on an uncertain row:** rejected, because a pair belongs to neither row, and checking "one pair per row" across rows is harder.
- **Keeping derived geometry rows and recomputing them in a script:** rejected, because overrides would not flow through, and the stored rows could drift from their inputs.

**Trade-offs accepted:**
- The schema now has six kinds.
- A table's completeness is checked by tests, not by the schema, because only the engine knows which keys it reads.
- Uncertain table cells are supported and tested, but no cell in the register is uncertain yet.

**Decisions inside this amendment for Magnus to confirm:**
- **RdSAP's thermal bridging is included** (`fabric.thermalBridging`, Table 21: y × the exposed area).
- **The cavity archetypes' party walls use RdSAP's "unable to determine" value, 0.25 W/m²K** (Table 15).

  Together with the derived geometry, a solid ground floor and curtains on windows, these raise the 1930s semi's heat loss coefficient from 302 to 341 W/K. Thermal bridging alone is 29 W/K. The calibrated temperature falls from 15.7 to 14.6 °C. Without thermal bridging it would be 15.2 °C.
- **RdSAP 10 has no default window-area formula**, because it measures windows on site. The archetypes use RdSAP 2012 Table S4 instead.
- **The 1930s semi keeps phase 1's 90 m² and unfilled cavity**, so its calibration target and NEED readings stay those of phase 1. The other archetypes use English Housing Survey floor areas.

---

## References

- [Phase 1 spec](../../SPECIFICATIONS/ARCHIVE/01-engine-core.md), "Register schema" and "Register integrity"
- [Model and register spec](../../SPECIFICATIONS/ORIGINAL_IDEA/home-energy-simulator-spec.md), "How the register works"
- [Zod documentation](https://zod.dev/)
