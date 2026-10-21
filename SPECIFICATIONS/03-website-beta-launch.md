# Phase 3: v1 website and beta launch

## Phase overview

**Phase number:** 3
**Phase name:** v1 website and beta launch
**Estimated timeframe:** 8–10 weeks of side-project time. The engine is done; the work is the site, the trust features and launch hardening.
**Dependencies:** Phase 2 (complete). The site uses the phase 2 engine and register unchanged, apart from the engine changes listed under "Engine changes for the site".

**Brief description:**
Phase 3 puts the phase 2 model in front of the public as a beta, a proof of concept. A visitor describes their house in about a minute, picks setups and a tariff, and sees each setup's running cost, carbon, upfront cost after the grant and payback side by side, as honest ranges. Any number can be opened to see where it comes from. Everything runs in the visitor's browser: no server receives or stores their details.

**Decisions Magnus made on 21 October 2026:**
- **Framework:** Next.js with a static export, served as static assets by a Cloudflare Worker, with the engine running in the browser.
- **Results:** the central result shows at once, and the ranges fill in shortly after, computed in a background web worker.
- **What visitors can change:** the house and its quick facts, plus a short "I have a quote" set (heat pump cost, boiler cost, solar size and solar cost). Full row-by-row overrides come later.
- **A boiler-age quick fact,** so payback reflects whether the visitor's boiler needs replacing now.
- **Hosting:** a free `*.workers.dev` address for the beta. Magnus points `energy.hultberg.org` at it later, when the site is close to a release.
- **Data refresh:** a documented, manual quarterly checklist. The site shows when prices were checked, and warns once data is past its due date.
- **Licence:** MIT for the code, done as a separate small PR before phase 3 starts (see "Licence").

Validation against real homes and expert review stay after the beta launch. They don't gate this phase or the launch.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md), the phase 2 [archived spec](./ARCHIVE/02-complete-v1-model.md), [engine.md](../REFERENCE/engine.md), [register.md](../REFERENCE/register.md) and the [client-side snapshots ADR](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md). The phase 3 "to decide" notes in [SPECIFICATIONS/CLAUDE.md](./CLAUDE.md) are each resolved below.

---

## Scope and deliverables

### In scope
- [ ] **A stack spike and a deployed hello-world,** before any feature work (see "PR workflow", PR 1).
- [ ] **Engine changes for the site:** the boiler-age answer in payback, quotes as visitor figures, display names in the register, shared caveat text, a browser sampler and the staleness check. See "Engine changes for the site".
- [ ] **The house form:** house type, floor area, occupants, loft, walls, glazing and boiler age. Phone-first and accessible.
- [ ] **Choosing setups and a tariff:** any of the four setups, on the price cap, Cosy (heat pump setups only) or Agile.
- [ ] **The 2D comparison view:** running cost, carbon, upfront cost after the grant and payback for each chosen setup, central first, then ranges, with every caveat next to the number it applies to.
- [ ] **"Where does this number come from?"** for every number shown: its register rows, sources, ranges, statuses and last-checked dates.
- [ ] **"I have a quote":** the visitor's heat pump cost, boiler cost, solar size and solar cost replace the model's figures, labelled "your figure".
- [ ] **Trust and content pages:** how it works, sources and credits, privacy, and the not-advice notice.
- [ ] **Staleness:** a "prices checked on" date, and a warning once any row the results use is past its due date or `validUntil`.
- [ ] **The data refresh checklist,** `REFERENCE/data-refresh.md`, run once before launch.
- [ ] **Hosting and security:** the Worker serving the static export on `*.workers.dev`, security headers graded A on securityheaders.com, and Cloudflare Web Analytics (cookie-free, so no consent banner).
- [ ] **The ADRs** listed under "Architecture decisions".
- [ ] **Tests,** plus `REFERENCE/site.md` (how the site works) and updates to `REFERENCE/engine.md`, `REFERENCE/register.md`, the troubleshooting guide, the README and the CLAUDE.md files.

### Out of scope (later phases or deferred)
- The custom domain `energy.hultberg.org`. Magnus points it at the Worker when he judges the site close to a release.
- Postcodes and locations other than London. The form asks for no postcode while only London is modelled.
- Full row-by-row overrides (U-values, SPF, prices) for enthusiasts.
- Calibration from a visitor's bills, and the Octopus smart-meter link.
- Looking up a home's EPC to pre-fill the form.
- Saving or sharing results (accounts, saved links).
- The 3D floating-island street (phase 4).
- Insulation and glazing upgrades as comparable options, batteries and EVs.
- A scheduled, automatic data refresh.

### Acceptance criteria
- [ ] **Same numbers as the report:** for the 1930s semi with its default answers, the site's central values equal the phase 2 report's exactly. A test holds this.
- [ ] **Speed:** on a mid-range phone (Lighthouse's mobile profile, with 4× CPU slowdown):
  - the central result for the visitor's choices appears within 200 ms of the last input;
  - the ranges appear within 3 seconds;
  - the page's Largest Contentful Paint is under 2.5 seconds.
- [ ] **Payload:** the first load is under 350 KB compressed, scripts and data together. The Agile snapshot loads only when Agile is chosen.
- [ ] **Ranges are honest about their noise:** at the browser's sample count, the share of samples in which a setup is cheapest carries about ±7 percentage points of noise at N=200. The site rounds it to 10% and says so.
- [ ] **Every caveat the report places next to a number appears next to the same number on the site:** the Agile limitations, the time-of-use assumptions, the issue 15 bias, VAT, a flagged archetype and a clipped solar size. The site and the report use the same text constants, and a test checks each appears.
- [ ] **Provenance:** every number on the results view opens its sources, and a test checks that every register row the results read has a source or a rationale on display.
- [ ] **Quotes:** a quote replaces the model's distribution for that cost with the visitor's figure in every sample, is labelled "your figure", and gets a gentle warning outside the row's range.
- [ ] **Boiler age:** each answer moves the reference boiler's first replacement as specified, with the hand-worked examples in `REFERENCE/engine.md` reproduced by tests.
- [ ] **Staleness:** with the register's dates moved into the past in a test, the site shows the warning.
- [ ] **Privacy:** nothing the visitor enters leaves the browser. The only outside request is Cloudflare Web Analytics' cookie-free beacon, and a test of the built site checks there are no other origins.
- [ ] **Security:** securityheaders.com grades the `*.workers.dev` site A or better, with a content security policy that allows only the site's own scripts, its web worker and the analytics beacon. Engine error messages are shown as plain text, never as HTML.
- [ ] **Accessibility:** WCAG 2.2 AA. Automated checks (axe) pass on every page, the form and results work by keyboard alone, and results make sense to a screen reader (tables have headers, ranges are read as "from … to …").
- [ ] **The not-advice notice** appears on the results view and in the footer of every page.
- [ ] **The refresh checklist** is written and has been run once, and the site's prices are in date at launch.
- [ ] **Quality:** tests pass with coverage at 95% or above for lines, functions and statements and 90% or above for branches; type checking, lint and the site build pass in CI; the phase 2 report still regenerates with no diff.

---

## Technical approach

### Architecture decisions

These need ADRs, which Magnus confirms, before the PR that relies on them is merged.

1. **Next.js static export, served by a Cloudflare Worker.**
   - The site is plain files: HTML, JavaScript and the data files. A Worker serves them as static assets and adds security headers. Nothing is calculated on a server.
   - The engine stays a pure TypeScript library with no Next.js dependency. The site imports it.
   - This follows the [client-side snapshots ADR](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md): visitors' details never leave the browser.
   - The code and data are readable by anyone, as for any website, and the repository is public. Protection comes from the licence, not from hiding the code.
2. **How visitor input reaches the engine.**
   - The house and quick facts go through the existing `House` input.
   - A quote is a **visitor figure:** it replaces the row's distribution (not just its default) in every sample, so the sampler never varies a number the visitor gave.
   - Visitor figures are a separate input from the sampling overrides, and only rows marked `overridable` accept them. This resolves the "how user overrides reach the engine" note.
3. **The licence:** MIT for the code. Data keeps its own terms, stated in a NOTICE file (see "Licence").

### The stack

- **Next.js** with `output: 'export'`, React and TypeScript, styled with Tailwind CSS and shadcn/ui components.
- **Hosting:** a Cloudflare Worker with static assets, configured with Wrangler. Security headers are set in the Worker or a `_headers` file, whichever the current Cloudflare docs recommend for static assets. Follow the `nextjs-on-cloudflare` skill and the current Cloudflare and Next.js docs at implementation time.
- **The web worker** runs the sampler off the main thread, using plain `postMessage` with no extra library.
- **Package layout:** the site lives in its own folder (`site/`), with its own `package.json` or as an npm workspace, decided by the spike. The engine stays importable with no Next.js dependencies.
- **Every new package** (Next.js, React, Tailwind, shadcn/ui's dependencies, Wrangler, axe) follows the [14-day rule](../REFERENCE/decisions/2026-10-18-fourteen-day-dependency-wait.md).

**The spike must prove four things before feature work starts:**
1. `next build` works with the repository's pinned TypeScript 7. Next.js runs its own type check through the TypeScript API. If that fails with TypeScript 7, the fallbacks are turning off Next's built-in check (keeping `npm run typecheck`) or giving the site its own TypeScript version.
2. The bundler accepts the engine's `.ts` import extensions, and the engine runs in a web worker.
3. A content security policy can reach grade A on a static export. Next.js injects inline scripts, and a static export can't use per-request nonces. The spike checks whether hashes work or `'unsafe-inline'` is needed, and what securityheaders.com grades the result. The policy must allow the web worker (`worker-src`, and `blob:` if the bundler needs it) and the analytics beacon.
4. The Worker serves the export on `*.workers.dev`, with the headers, from a deploy step Magnus can run.

If any of these fails, the spike stops and Magnus decides, before the next PR starts.

### Engine changes for the site

- **Boiler age.** A quick fact with four answers: "It needs replacing now", "Up to 4 years old", "5 to 9 years old", "10 years or older".
  - The answers map to an age (a `table` row: 13, 2, 7 and 12 years, approximate, with a rationale).
  - The reference keeps the existing boiler and replaces it when its remaining life runs out: in year max(0, boiler lifetime − age), then every lifetime after.
  - Every other setup buys its kit now. A gas setup with solar keeps the existing boiler on the same rule.
  - "Needs replacing now" reproduces phase 2's payback exactly. This closes the boiler half of [#37](https://github.com/mannepanne/energy-sim/issues/37).
  - The hand-worked payback examples in `REFERENCE/engine.md` gain one per answer.
- **Visitor figures** (see "Architecture decisions" item 2) for `costs.heatPumpInstalled`, `costs.boilerInstalled`, `costs.pvPerKwp` (entered as a total solar cost, divided by the size) and the solar size.
  - A figure outside the row's low–high range is accepted, with a gentle warning.
  - **A clipped solar size.** A size the visitor enters is used as entered, not clipped to the roof maximum, and the site says so. For the model's own default size, the site shows "your roof fits about X kWp" when the size is clipped. This resolves the "clipped solar size" note.
- **Display names in the register.** The archetype display names move from `scripts/archetypes/table.ts` into the register, as a `table` of strings keyed by archetype. The site and the report read the same rows. This resolves the "display names" note.
- **Shared caveat text.** The caveat constants (`agileLimitations`, `TIME_OF_USE_ASSUMPTIONS`, the issue 15 bias, the VAT note, the flag warning) move from `scripts/` to `src/`, so the site and the report use the same text.
- **A browser sampler.** It runs only the combinations the visitor chose, at N=200, in the web worker. Central values come from the same code path as the report, so they match exactly.
- **Staleness.** A function returns every row the chosen results read that is past its due date or `validUntil` on a given date. The site passes today's date; the report keeps not reading the clock.

### The visitor journey

1. **Describe the house** (about a minute):
   - house type (the ten archetypes, by display name);
   - floor area, defaulting to the archetype's;
   - occupants;
   - loft, walls (only the answers that fit the archetype) and glazing;
   - boiler age.
2. **Pick setups and a tariff:** the four setups are chosen by default; the tariff defaults to the price cap. Cosy is offered only with a heat pump.
3. **See the comparison:** each chosen setup's running cost, carbon, upfront cost after the grant and payback, side by side. The central values appear at once, and the ranges fill in when the worker finishes.
4. **Open any number** to see its sources, and **add a quote** where the visitor has one.

**The flagged archetype.** When the visitor's house type is flagged (more than 25% outside its NEED readings), the results show the warning prominently, above the numbers, in the report's words. This resolves the "flag warning" note.

**Errors** are shown as plain text, never as HTML, because some engine errors repeat the input value. This resolves the "engine errors" note.

### Content pages

- **How it works:** a plain-language summary of the model, linking to the phase 2 report and the repository.
- **Sources and credits:** every data source with its attribution and licence, generated from the register and the NOTICE file.
- **Privacy:** nothing the visitor enters leaves their browser; the only outside request is the cookie-free analytics beacon.
- **The not-advice notice:** "These are estimates for a typical house of this kind, not advice for your home, and not financial advice." It appears on the results view and in every page footer.
- **Beta label:** every page says the site is a beta, a proof of concept.
- **Brand-neutral:** no char.gy branding, until Magnus has agreed any involvement with his employer.

### Data refresh

`REFERENCE/data-refresh.md` lists, for each quarter:
- which rows fall due (the price cap rows, Cosy, Agile, the export rate, the grant);
- the commands to re-fetch (`npm run fetch:pvgis` is yearly; the Octopus and Ofgem steps are quarterly);
- what to check in the diff;
- regenerating the report and opening the PR.

It is run once before launch. Ofgem usually publishes the January–March cap in late November; the checklist gives the date to confirm.

### Licence

A separate small PR, before phase 3 PR 1:
- `LICENSE`: MIT for the code, copyright Magnus Hultberg.
- `NOTICE`: the data keeps its own terms. Before writing it, check:
  - the Octopus API's terms on republishing tariff data (`data/snapshots/octopus-london.json` is committed in a public repository);
  - the terms on the Elexon download page for the profile class values;
  - the attribution PVGIS asks for;
  - the Open Government Licence attribution for Ofgem, NEED and DESNZ data;
  - that nothing from the gitignored `REFERENCE/data-downloads/` is committed.
- An ADR for the licence decision.

Magnus may want to check his employment contract's IP terms before granting an open-source licence. That is his call.

### Testing strategy

**Unit tests (engine):** boiler age, visitor figures, the staleness function, the browser sampler's central values against the report's, and the shared caveat constants.

**Component tests (site):** the form offers only valid wall answers, Cosy only with a heat pump, every caveat appears next to its number, every number opens its provenance, and errors render as text.

**Built-site tests:**
- the static export contains no request to any origin but its own and the analytics beacon;
- axe passes on every page;
- the payload budget holds.

**Manual checks before launch:**
- securityheaders.com on the `*.workers.dev` site;
- Lighthouse on its mobile profile;
- keyboard-only and screen-reader passes (VoiceOver on iOS and macOS);
- the refresh checklist, run once.

**Coverage:** as phases 1 and 2, measured on the engine and on the site's logic.

---

## Pre-commit checklist

- [ ] Tests pass, type checking and lint pass, the site builds, and coverage meets targets.
- [ ] `npm run report` regenerates with no diff.
- [ ] The docs are updated: `REFERENCE/site.md`, `REFERENCE/engine.md`, `REFERENCE/register.md`, the troubleshooting guide, the README and the CLAUDE.md files.
- [ ] There is no debug output and there are no secrets. Any Cloudflare deploy token lives outside the repository.

---

## PR workflow

0. **Licence** (separate, before phase 3): `LICENSE`, `NOTICE` and the licence ADR.
1. `feature/phase-3-spike`: the stack spike and a deployed hello-world on `*.workers.dev` that runs the central engine in a web worker, with the headers graded and the framework ADR. Stops for Magnus's decision if any of the four checks fails.
2. `feature/phase-3-engine-for-site`: the engine changes (boiler age, visitor figures and their ADR, display names, shared caveats, the browser sampler, staleness), with tests. The report regenerates; only the parts the changes touch move.
3. `feature/phase-3-form`: the house form and the setup and tariff choice.
4. `feature/phase-3-results`: the comparison view, central then ranges, caveats and the flag warning.
5. `feature/phase-3-provenance-quotes`: "where does this number come from?" and "I have a quote".
6. `feature/phase-3-content`: the content pages, the not-advice notice, the beta label, staleness, and the refresh checklist (run once).
7. `feature/phase-3-launch`: the payload and speed budgets, accessibility, securityheaders A, analytics, and the beta launch on `*.workers.dev`.

Run `/review-pr` on each. The site stays on `*.workers.dev` throughout; deploys happen from PR 1 onwards so every PR can be checked live.

---

## Edge cases and considerations

### Known risks
- **Next.js with TypeScript 7.** The spike tests it first and has fallbacks.
- **A content security policy on a static export.** The spike tests it first. If grade A needs `'unsafe-inline'` for scripts, Magnus decides between accepting a lower grade and moving away from Next.js's inline scripts.
- **Phone speed.** The browser sampler runs only the chosen combinations, at N=200, off the main thread. If it still misses 3 seconds, the sample count drops, and the stated noise rises with it.
- **Stale data at launch.** The price cap rows expire on 31 December 2026. The refresh checklist runs before launch.
- **Data licences.** If a source's terms forbid republishing its data in a public repository, that data has to be reduced to the values the engine needs, or fetched at build time and not committed. The licence PR finds out first.
- **Neutrality.** The comparison shows every chosen setup the same way, with the cheapest highlighted by the numbers alone, never by design emphasis.

### Security
- No server, no accounts, no personal data stored.
- Security headers graded A; a content security policy limited to the site's own origin, its worker and the analytics beacon.
- Errors rendered as text. Visitor input is validated before it reaches the engine.
- The deploy token stays outside the repository.

---

## Technical debt

Carried forward from phase 2, unchanged: [#14](https://github.com/mannepanne/energy-sim/issues/14)–[#17](https://github.com/mannepanne/energy-sim/issues/17), [#24](https://github.com/mannepanne/energy-sim/issues/24)–[#27](https://github.com/mannepanne/energy-sim/issues/27), [#34](https://github.com/mannepanne/energy-sim/issues/34), [#39](https://github.com/mannepanne/energy-sim/issues/39) and [#43](https://github.com/mannepanne/energy-sim/issues/43)–[#45](https://github.com/mannepanne/energy-sim/issues/45).

[#37](https://github.com/mannepanne/energy-sim/issues/37) is partly closed by the boiler-age answer; its "undiscounted" half carries forward.

New, tracked when their code lands: London only, with no postcode; a short quote list rather than full overrides; N=200 in the browser against N=500 in the report; manual data refresh.

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md) and [model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md)
- [Phase 2 spec (archived)](./ARCHIVE/02-complete-v1-model.md) and the [phase 2 report](../reports/phase-2-v1-model.md)
- [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md)
- [ADR: client-side, build-time snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md)
- [ADR: 14-day dependency wait](../REFERENCE/decisions/2026-10-18-fourteen-day-dependency-wait.md)
