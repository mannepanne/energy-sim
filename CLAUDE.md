# CLAUDE.md

Navigation index and quick reference for working with this project.

---

**⚠️ THIS IS A TEMPLATE** - Replace this entire file with your project-specific content when starting a new project. Use the sections below as a guide for what to include.

---

## Rules of engagement

Collaboration principles and ways of working: @.claude/CLAUDE.md
When asked to remember anything, add project memory in this CLAUDE.md (project root), not @.claude/CLAUDE.md.

## Project overview

**energy-sim** (working title) - A free public website where a homeowner in England compares whole-house energy setups side by side, with cost, carbon and payback shown as honest ranges.

**[Optional: Name inspiration or meaningful context about the project name]**

**Core workflow:**
1. [Key user action or process step 1]
2. [Key user action or process step 2]
3. [Key user action or process step 3]
4. [Key user action or process step 4]

**Full specification:** [project-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/project-outline.md) (model and data detail in [home-energy-simulator-spec.md](./SPECIFICATIONS/ORIGINAL_IDEA/home-energy-simulator-spec.md))

## Architecture overview

**Stack:**
- **Language**: TypeScript (strict), current Node LTS
- **Engine**: pure TypeScript library with no I/O; register validated with Zod
- **Testing**: Vitest with V8 coverage; GitHub Actions CI
- **Data**: build-time snapshots committed as JSON; no runtime external API calls
- **Web framework and styling**: TBD in phase 3
- **Database**: none planned (fully client-side, nothing personal stored)
- **Deployment**: Cloudflare (planned for phase 3)
- **Domain**: TBD

**Key Integrations** (all fetched at build time, never from the browser):
- PVGIS (EU JRC): hourly typical-year weather and solar
- Ofgem price cap; Octopus public tariff API (phase 2)
- NESO carbon intensity API (phase 2)

**Current Status:** Planning complete for phase 1. Spec reviewed and revised; implementation not started.

## Implementation phases

Development is organised into numbered phases with clear deliverables, testing requirements, and PR workflows. The full list, with the later work and the non-code tracks, is in [SPECIFICATIONS/CLAUDE.md](./SPECIFICATIONS/CLAUDE.md).

1. [01-engine-core.md](./SPECIFICATIONS/01-engine-core.md) - Benchmark first, then the typed register and headless hourly engine for one archetype, with paired ranges (4–6 weeks)
2. Phase 2: complete v1 model - archetypes, hourly heat pump COP, time-of-use tariffs, solar, costs, grants, payback (spec to be written)
3. Phase 3: v1 website and launch - form, 2D comparison, hosting, validation gate (spec to be written)
4. Phase 4: 3D floating-island street - the committed next step after v1 (spec to be written)

**Current phase:** Phase 1, engine core (spec reviewed and revised; ready to start)

### SPECIFICATIONS/
- **Implementation phases** (numbered files) - Active work-in-progress
- **ORIGINAL_IDEA/** - Master spec, product vision, naming inspiration
- **ARCHIVE/** - Completed specs (move here when phase complete)

### REFERENCE/
How-it-works documentation for implemented features:
- [testing-strategy.md](./REFERENCE/testing-strategy.md) - Testing philosophy and approach
- [environment-setup.md](./REFERENCE/environment-setup.md) - API keys and environment configuration
- [troubleshooting.md](./REFERENCE/troubleshooting.md) - Common issues and solutions
- [TEMPLATE-UPDATES/](./REFERENCE/TEMPLATE-UPDATES/) - Migration packets for rolling out template improvements to derivative projects
- [Add project-specific reference docs as they're created]

*Note: Keep CLAUDE.md files short (<300 lines). Break details into separate reference files with succinct summaries. CLAUDE.md files work as "library index" to find context when needed, minimising token usage.*

## Code conventions

### File headers
```typescript
// ABOUT: Brief description of file purpose
// ABOUT: Key functionality or responsibility
```

### Naming
- Descriptive names: [Provide project-specific examples]
- TypeScript conventions: camelCase (variables), PascalCase (types)
- Avoid temporal references: no "new", "improved", "old"

### Comments
- Evergreen (describe what code does, not recent changes)
- Minimal (code should be self-documenting)
- Explain complex logic and non-obvious decisions

## Development workflow

**⚠️ CRITICAL: ALL CODE CHANGES REQUIRE A FEATURE BRANCH + PR ⚠️**

**Step 0 (BEFORE making ANY changes):**
- [ ] On feature branch (not main)?
- [ ] If on main: create feature branch first

**CRITICAL: ALL changes require feature branch + PR. NEVER work on main. Zero exceptions.**

**Implementation steps:**
1. Create feature branch (feature/, fix/, refactor/)
2. Check SPECIFICATIONS/ for relevant specs
3. Review spec with **`/review-spec`** before starting non-trivial features
4. Implement with tests (run tests + type checking)
5. Create PR for review:
  - **`/review-pr`** - Smart dispatcher: triages the change and routes to light / standard / team (1–5 min end-to-end; longer when auto-escalated to team tier)
  - **`/review-pr-team`** - Force full four-perspective review, skip triage (2–4 min)
  - **See:** [pr-review-workflow.md](./REFERENCE/pr-review-workflow.md)

## TypeScript configuration

[Customise based on your project]
- Target: [e.g., ESNext, ES2022, etc.]
- Strict mode: [enabled/disabled]
- Path alias: [e.g., `@/` maps to `./src/`]
- Special types: [e.g., React, Next.js, Node, etc.]

## Testing

Tests serve dual purpose:
1. **Validation** - Verify code works
2. **Directional Context** - Guide AI development

**Commands:**
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

**Coverage target:** 100% (enforced minimums: 95% lines/functions/statements, 90% branches)

**See:** [testing-strategy.md](./REFERENCE/testing-strategy.md) for complete details

## Quick reference links

**Planning & Specs:**
- **Project outline** → [SPECIFICATIONS/ORIGINAL_IDEA/project-outline.md](./SPECIFICATIONS/ORIGINAL_IDEA/project-outline.md)
- **Implementation phases** → See section above or [SPECIFICATIONS/](./SPECIFICATIONS/)
- **Completed specs** → [ARCHIVE/](./SPECIFICATIONS/ARCHIVE/)
- **Other ORIGINAL_IDEA documents** (naming, brainstorms, research — if you've added any) → [SPECIFICATIONS/ORIGINAL_IDEA/](./SPECIFICATIONS/ORIGINAL_IDEA/)

**Reference Docs:**
- **Setting up environment?** → [environment-setup.md](./REFERENCE/environment-setup.md)
- **Testing strategy?** → [testing-strategy.md](./REFERENCE/testing-strategy.md)
- **Known issues / technical debt?** → GitHub Issues with `technical-debt` label
- **Getting unstuck?** → [troubleshooting.md](./REFERENCE/troubleshooting.md)
- **Architecture decisions?** → [decisions/](./REFERENCE/decisions/) - ADRs explaining why things are this way
- **Rolling out a template improvement?** → [TEMPLATE-UPDATES/](./REFERENCE/TEMPLATE-UPDATES/) - Migration packets for derivative projects

## Project-specific notes

[Add any project-specific context, quirks, or important information here]

**Example topics:**
- Special build considerations
- Deployment gotchas
- External service limitations
- Performance targets
- Security requirements
- Compliance considerations

---

**Remember:** This file is your navigation hub. Keep it current as the project evolves, but keep it concise. Details belong in subdirectory files.
