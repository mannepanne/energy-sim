# energy-sim

*Working title.* A free public website where a homeowner in England can compare whole-house energy setups side by side: a gas boiler or a heat pump, with or without solar, on a chosen tariff. Each setup shows its annual cost, carbon and payback as honest ranges, and every number links to its source.

The site gives estimates, not financial advice. Its results are never influenced by commercial relationships.

## Status

Phase 1 of 4 is under way: a headless TypeScript engine for one house type (a 1930s semi in London), comparing a gas boiler with a heat pump. So far the repository has its tooling, CI, the benchmark (a rough heat-demand estimate checked against the government's Home Energy Model and against measured gas use), the parameter register that holds every number the engine uses, the hourly engine, and seeded uncertainty ranges with a paired comparison and a sensitivity table. The results are in the [phase 1 report](./reports/phase-1-london-semi.md). There is no website yet.

- What the project is: [project outline](./SPECIFICATIONS/ORIGINAL_IDEA/project-outline.md)
- What phase 1 builds: [phase 1 spec](./SPECIFICATIONS/01-engine-core.md)
- The benchmark and its decision: [scripts/benchmark/](./scripts/benchmark/README.md)
- The parameter register: [REFERENCE/register.md](./REFERENCE/register.md)
- How the engine works: [REFERENCE/engine.md](./REFERENCE/engine.md)

## Getting started

You need Node.js 24 (the current LTS; the exact major is in `.nvmrc`).

```bash
npm ci
npm test
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run lint` | Runs Oxlint, including type-aware rules |
| `npm run test:coverage` | Runs the tests and enforces the coverage thresholds (95% lines, functions and statements; 90% branches) |
| `npm run benchmark:rough` | Prints the rough heat-demand estimate for the phase 1 house |
| `npm run benchmark:hem-input` | Writes the Home Energy Model input files for the benchmark |
| `npm run benchmark:tables` | Prints the HEM and measured-data comparison tables |
| `npm run fetch:pvgis` | Re-fetches the PVGIS weather snapshot for London (needs network access; commit the result) |
| `npm run calibrate` | Solves the mean internal temperature for the measured-gas target with the hourly engine |
| `npm run report` | Writes the phase 1 report, `reports/phase-1-london-semi.md` (offline; commit the result) |
| `npm run bench` | Times 500 samples × 2 setups, and fails above 5 seconds |

GitHub Actions runs the type check, lint, tests with coverage, the report drift check and the bench on every pull request.

## How the repository is organised

```
data/                The parameter register and committed data snapshots
src/register/        Register schema, loader and typed accessor
src/engine/          The hourly engine, plus sampling, the paired comparison and sensitivity
src/snapshots/       Schemas for the data snapshots
scripts/             Build-time scripts: the PVGIS fetch, the calibration, the report, the bench and the benchmark
scripts/report/      Builds the phase 1 report
scripts/benchmark/   Benchmark: rough estimate, HEM run and measured-data comparison
reports/             Generated reports, committed and checked for drift in CI
SPECIFICATIONS/      Plans for the current and future phases
REFERENCE/           How implemented parts work, and decision records
.claude/             Ways of working with Claude Code
```

## Data and privacy

All outside data (weather, prices, carbon factors) is fetched by scripts at build time and committed as snapshots. The website will run entirely in the visitor's browser, so no server ever holds a visitor's details. See the [decision record](./REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md).

## Credits

The repository started from Magnus Hultberg's AI-assisted project template. [TEMPLATE-INSTRUCTIONS.md](./TEMPLATE-INSTRUCTIONS.md) describes how that template works.
