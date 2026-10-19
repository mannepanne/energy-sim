# Reference Documentation Library

Auto-loaded when working with files in this directory. How-it-works documentation for implemented features.

## Files in this directory

### [testing-strategy.md](./testing-strategy.md)
**When to read:** Writing tests, setting up test coverage, or implementing TDD workflow.

Testing philosophy, where tests live (next to the code), Vitest set-up, coverage requirements and exceptions, and the CI checks.

### [register.md](./register.md)
**When to read:** Adding or changing a register row, reading parameters in the engine, refreshing the PVGIS snapshot, or checking where a number comes from.

Row kinds and fields (including `table` and `correlation`), the integrity rules and their messages, the typed accessor, the archetype and fabric rows and the RdSAP check, the solar rows and the Elexon base electricity profile, the mean internal temperature calibration, and the PVGIS and PVcalc snapshot formats.

### [engine.md](./engine.md)
**When to read:** Changing the physics, reading engine results, adding an engine input, or checking how a number is calculated.

The hourly engine's files and API, houses and quick facts, derived geometry, the ISO 13370 ground floor, the heat loss, space heat, solar, hot water and cylinder, supply, the heat pump COP curve, roof solar and its self-consumption, cost and carbon formulas, the hand-calculated fixture house and two archetypes, the checks against Duffie and Beckman, HEM and PVGIS's PV calculator, the archetype table, the time base, the seeded sampling with its copula, the paired comparison and sensitivity table, and how the phase 1 report is generated.

### [environment-setup.md](./environment-setup.md)
**When to read:** Setting up local development, configuring secrets, or deploying to production.

Node version, installing dependencies, and where secrets will go. Phase 1 needs no API keys.

### [troubleshooting.md](./troubleshooting.md)
**When to read:** A check fails locally or in CI, the register won't load, or a data file needs refreshing.

Set-up problems, register validation, table key parity and calibration failures, flagged archetypes, report drift and bench failures in CI, the HEM check and the benchmark's drift tests, and refreshing PVGIS and prices.

### [pr-review-workflow.md](./pr-review-workflow.md)
**When to read:** Starting a new feature, creating PRs, or running any kind of review.

How to use `/review-spec` (pre-implementation), `/review-pr`, and `/review-pr-team` skills.

### [profile-setup-hook.md](./profile-setup-hook.md)
**When to read:** The profile setup prompt fired and you want to understand what's going on, you want to suppress or disable the hook, or you want to extend the setup flow.

What the hook detects, the `.local` file pattern, how the signal is consumed by Claude, test command, extension points, and removal steps. Decision rationale at [`decisions/2026-05-24-personal-profile-setup-sentinel.md`](./decisions/2026-05-24-personal-profile-setup-sentinel.md).

### [safety-harness.md](./safety-harness.md)
**When to read:** A safety-harness block or ask dialog fired and you want to understand what's going on, you want to add a pattern, or you want to bypass the hook for a legitimate use.

What's caught at block / ask tier, what's deliberately not caught, how the inline `SAFETY_HARNESS_OFF=1` bypass works (and its limits), how the hook composes with the allowlist, how to extend patterns + tests.

### [scratch-write-hook.md](./scratch-write-hook.md)
**When to read:** Reviewing or extending the `Write` auto-approval for `<project>/SCRATCH/`, debugging a SCRATCH/ Write prompt that fired unexpectedly, or removing the hook if upstream Claude Code fixes the underlying matcher.

What the hook approves and why, where it sits in the call path alongside `safety-harness.sh`, what's deliberately out of scope (symlinks, exotic filenames), how to extend, and the rollback path if the upstream defect is fixed. Decision rationale at [`decisions/2026-04-26-scratch-write-pretooluse-hook.md`](./decisions/2026-04-26-scratch-write-pretooluse-hook.md).

### [decisions/](./decisions/)
**When to read:** Making architectural decisions, choosing between alternatives, or looking up why something was built the way it was.

Architecture Decision Records (ADRs) — permanent log of significant technical choices, alternatives considered, and trade-offs accepted.

### [TEMPLATE-UPDATES/](./TEMPLATE-UPDATES/)
**When to read:** Rolling out a template improvement to a derivative project, or formalising a new improvement so future derivative projects can adopt it.

Migration packets that describe template changes in conceptual terms plus a file manifest, so a Claude in another project can compare against local files and apply the improvement without clobbering customisations.
