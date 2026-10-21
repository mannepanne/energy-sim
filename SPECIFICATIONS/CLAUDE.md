# Implementation specifications library

Auto-loaded when working with files in this directory. Forward-looking plans for features being built.

---

## Purpose of this folder

The SPECIFICATIONS folder contains **forward-looking plans** for features you're actively building. These are living documents that guide development and evolve as you learn more.

### Key principles

1. **Specifications are active work** - They describe what you're building *now* or *next*
2. **One phase at a time** - Focus on clear, sequential implementation phases
3. **Move completed specs to ARCHIVE/** - Keep this folder focused on current/upcoming work
4. **Reference ORIGINAL_IDEA/** - Link back to master vision for context

## How to structure implementation phases

Break your project into numbered sequential phases (e.g., 01-foundation.md, 02-authentication.md, etc.).

### What each phase file should include

1. **Phase overview**
   - Phase number and name
   - Brief description
   - Estimated timeframe
   - Dependencies on previous phases

2. **Scope and deliverables**
   - What will be built in this phase
   - What's explicitly out of scope
   - Acceptance criteria

3. **Technical approach**
   - Architecture decisions (document significant choices as ADRs in REFERENCE/decisions/)
   - Technology choices (check existing ADRs for precedent before deciding)
   - Key files and components
   - Database schema changes (if applicable)

4. **Testing strategy**
   - Unit test requirements
   - Integration test requirements
   - Coverage targets
   - Manual testing checklist

5. **Pre-commit checklist**
   - [ ] All tests passing
   - [ ] Type checking passes
   - [ ] Coverage meets targets
   - [ ] Manual verification complete
   - [ ] Documentation updated

6. **PR workflow**
   - Branch naming convention
   - PR review requirements
   - Deployment steps

7. **Edge cases and considerations**
   - Known risks or challenges
   - Alternative approaches considered
   - Future optimization opportunities

### Example phase structure

See [00-TEMPLATE-phase.md](./00-TEMPLATE-phase.md) for a complete example.

## Supporting folders

### ORIGINAL_IDEA/

Store your initial project concept documents here:
- Master specification and product vision
- Naming rationale and inspiration
- Early brainstorming and requirements
- Competitive analysis or market research

These documents are the "source of truth" for the project's intent and typically don't change during implementation.

### ARCHIVE/

Move completed phase files here after:
1. Phase implementation is complete
2. PR is merged to main
3. Features are deployed/verified

Archive serves as historical record. For current implementation details, see `REFERENCE/` documentation instead.

## Workflow example

**Starting a new project:**
1. Fill in the master specification stub at `ORIGINAL_IDEA/project-outline.md` (created during the orientation conversation)
2. Break project into phases (e.g., 01-foundation.md, 02-core-features.md)
3. Work through phases sequentially
4. Move completed specs to ARCHIVE/
5. Create how-it-works docs in REFERENCE/ for implemented features

**Current phase tracking:**
Update the "Current phase" indicator in both:
- Root CLAUDE.md (project navigation)
- This file (implementation library)

## When to update this file

Replace this template guidance with your actual phase list when you:
1. Complete project planning
2. Define your implementation phases
3. Are ready to begin development

**Keep it current** - Update phase status as you progress through development.

---

## Active implementation phases

Development runs in four phases. v1 leads with the numbers, and the 3D street follows once the numbers are trusted. Only the current phase has a full spec file; later phases get theirs when they start.

**Current phase:** Phase 3, v1 website and beta launch (spec written and reviewed; implementation not started). Phases 1 and 2 are complete and their specs are archived.

1. **[01-engine-core.md](./ARCHIVE/01-engine-core.md)** (complete, archived 18 October 2026)
   Proves the heat-demand physics and the trust plumbing. A benchmark against HEM or measured data comes first. Then repo tooling and CI, the typed parameter register, and a headless hourly engine for one archetype (a 1930s semi in London), comparing gas with a heat pump on the price cap. Results come with paired uncertainty ranges and a sensitivity table, and the phase ends with a report Magnus can check without running code. Sending it to an outside expert is optional.

2. **[02-complete-v1-model.md](./ARCHIVE/02-complete-v1-model.md)** (complete, archived 21 October 2026)
   About ten house types with quick facts; gas boiler or heat pump, each with or without solar; a heat pump COP curve anchored on the field SPF; thermal mass and heating schedules, checked against HEM; the London price cap, Octopus Cosy and Agile; costs, the grant and payback under a shared price scenario. Weather variation between years, an hourly grid-carbon profile and heat pump sizing are deferred.

3. **[03-website-beta-launch.md](./03-website-beta-launch.md)** (10–12 weeks; spec reviewed and revised)
   The input form, the 2D comparison view, "where does this number come from?", the not-advice notice, Cloudflare hosting, cookie-free analytics and an A grade on securityheaders.com. It launches as a public beta, a proof of concept. Validation against real homes and expert review come after launch and do not gate it.
   The five "to decide in the phase 3 spec" notes from phase 2 (the flag warning, user overrides, display names, a clipped solar size, and errors shown as text) are each resolved, by name, in the phase 3 spec.

4. **Phase 4: 3D floating-island street** (spec to be written)
   This is the committed next step after v1, and the project's main marketing asset. It is a low-poly Three.js diorama, drawn only from engine results.

**Later, after phase 4:** bill calibration (including the Octopus smart-meter link), home batteries and EVs (including on-street charging), insulation and glazing upgrades as options, all of England, then Wales and Scotland.

**Non-code tracks** (they improve trust in the numbers after the beta launch; none of them gates any phase or the launch):
- Recruit 10–20 volunteer homes with a year of gas and electricity bills.
- Find a retrofit assessor or heat pump installer, plus Magnus's EV-industry friend, to review the register.

**Separately:** talk to char.gy about the project, and check the employment contract's IP terms. This is not a trust check. Until it is done, the site stays brand-neutral (see root `CLAUDE.md`); whether it must happen before the public beta is Magnus's call.

### Supporting documentation

**[ORIGINAL_IDEA/](./ORIGINAL_IDEA/)**
- `project-outline.md` - Master specification and product vision (always present as a stub)
- Optional additions: `naming-rationale.md`, brainstorms, competitive analysis, sketches, briefs

**[ARCHIVE/](./ARCHIVE/)**
- Completed specifications (moved here when phase is done)

**[REFERENCE/decisions/](../REFERENCE/decisions/)** - Architecture Decision Records
- Search here BEFORE making architectural decisions (library choice, patterns, API design)
- Follow existing ADRs unless new information invalidates reasoning
- Document new architectural decisions here (prevents re-debating settled choices)
- See [ADR guidance](../REFERENCE/decisions/CLAUDE.md) for when and how to create ADRs

## When specs move to archive

After completing a phase and merging the PR:
1. Move the phase file to `ARCHIVE/`
2. Update implementation docs in `REFERENCE/` if needed
3. Update this index to reflect current phase
