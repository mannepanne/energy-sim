# Environment setup

**When to read this:** Setting up the project on a new machine, or adding a secret or external service.

**Related documents:**
- [CLAUDE.md](./../CLAUDE.md) - Project navigation index
- [README.md](./../README.md) - Getting started and commands
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions

---

## Local development

1. Install Node.js 24, the current LTS. `.nvmrc` holds the major version, so `nvm use` picks it up.
2. Install the exact locked dependencies:

   ```bash
   npm ci
   ```

3. Check everything works:

   ```bash
   npm run typecheck
   npm run lint
   npm run test:coverage
   ```

The full command list is in the [README](./../README.md#getting-started).

## Local-only source data

Licensed downloads used for cross-checks go in `REFERENCE/data-downloads/`, which git ignores. Their licences forbid redistribution, so they are never committed, and only aggregate figures go into the docs. A fresh clone has none of them. To repeat the heat pump cross-check (see [engine.md](./engine.md#checks-against-outside-references)), download them again into `REFERENCE/data-downloads/eoh/`:
- the Electrification of Heat daily dataset, UK Data Service SN 9210 (needs a UK Data Service login);
- the trial's final "Heat Pump Performance Data Analysis Report", through the form on Energy Systems Catapult's reports page.

## Secrets and API keys

**Phase 1 needs none.** The engine is a pure library, and nothing is deployed.

External data (PVGIS weather, Ofgem prices, carbon factors) comes from public endpoints that need no key. Scripts fetch it at build time and commit it as snapshots; the browser never calls an outside service. See the [client-side snapshots ADR](./decisions/2026-10-17-client-side-build-time-snapshots.md).

When a later phase adds a secret (for example, Cloudflare deployment credentials in phase 3), document it here: what it is for, how to obtain it, where it lives locally (a gitignored file such as `.dev.vars`) and in production, and what permissions it needs. Never commit a secret; `.gitignore` already excludes the usual secret files.

## Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` on every pull request and every push to `main`. It needs no secrets: it reads the repository with a read-only token and runs the type check, lint, tests with coverage, the report drift check (`npm run report` must leave `reports/` unchanged) and the bench (500 samples × 2 setups, failing above 5 seconds). Details are in [testing-strategy.md](./testing-strategy.md#cicd-integration).
