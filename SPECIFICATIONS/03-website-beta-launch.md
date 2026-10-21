# Phase 3: v1 website and beta launch

## Phase overview

**Phase number:** 3
**Phase name:** v1 website and beta launch
**Estimated timeframe:** 10–12 weeks of side-project time. The engine is done; the work is the site, the trust features and launch hardening.
**Dependencies:** Phase 2 (complete), and the licence PR (see "Licence"). The site uses the phase 2 engine and register, with the changes listed under "Engine changes for the site".

**Brief description:**
Phase 3 puts the phase 2 model in front of the public as a beta, a proof of concept. A visitor describes their house in about a minute, picks setups and a tariff, and sees each setup's running cost, carbon, upfront cost after the grant and payback side by side, as honest ranges. Any number can be opened to see where it comes from. Everything runs in the visitor's browser: no server receives or stores their details.

**Decisions Magnus made on 21 October 2026:**
- **Framework:** Next.js with a static export, served as static assets by a Cloudflare Worker, with the engine running in the browser. **Vite with React is the named fallback** if the spike shows Next.js can't meet the TypeScript or security-policy checks.
- **Results:** the central result shows at once, and the ranges fill in shortly after, computed in a background web worker.
- **Tariffs:** every chosen setup is shown on the price cap, and next to it on the time-of-use tariff the visitor picks. The tariff's effect is visible, not hidden behind a default.
- **"How often cheapest"** is shown in words ("almost always", "usually"), with the number in the provenance panel.
- **What visitors can change:** the house and its quick facts, plus a short "I have a quote" set (heat pump cost, boiler cost, solar size and solar cost). Full row-by-row overrides come later.
- **A boiler-age quick fact,** so payback reflects whether the visitor's boiler needs replacing now.
- **Hosting:** a free `*.workers.dev` address for the beta. Magnus points `energy.hultberg.org` at it later, when the site is close to a release.
- **Data refresh:** a documented manual quarterly checklist. The site shows when prices were checked and warns once data is past its due date. A weekly CI check opens an issue when anything falls due.
- **A feedback link** on every result.
- **Licence:** MIT for the code, in a separate small PR before phase 3 starts.

Validation against real homes and expert review stay after the beta launch. They don't gate this phase or the launch.

Background: [project-outline.md](./ORIGINAL_IDEA/project-outline.md), the phase 2 [archived spec](./ARCHIVE/02-complete-v1-model.md) and [report](../reports/phase-2-v1-model.md), [engine.md](../REFERENCE/engine.md), [register.md](../REFERENCE/register.md) and the [client-side snapshots ADR](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md). The five phase 3 "to decide" notes in [SPECIFICATIONS/CLAUDE.md](./CLAUDE.md) are each resolved below, by name.

---

## Scope and deliverables

### In scope
- [ ] **A stack spike and a deployed hello-world** before any feature work (PR 1).
- [ ] **Engine changes for the site** (see "Engine changes for the site").
- [ ] **Generated site data:** `site-data.json`, baked at build time and checked for drift in CI (see "Generated site data").
- [ ] **The house form,** phone-first and accessible (see "The form").
- [ ] **The comparison view:** running cost, carbon, upfront cost after the grant and payback for each chosen setup, on the cap and on the chosen tariff. A headline sentence comes first, then the central values, then the ranges, with every caveat next to the number it applies to (see "The results").
- [ ] **"Where does this number come from?"** for every number shown (see "Provenance").
- [ ] **"I have a quote"** (see "Quotes").
- [ ] **Trust and content pages:** how it works, sources and credits, privacy, the not-advice notice, the beta label, a 404 page and the feedback link.
- [ ] **Staleness:** the "prices checked on" date, the in-page warning, and the weekly CI check.
- [ ] **The data refresh checklist,** `REFERENCE/data-refresh.md`, run for the January–March 2027 cap before launch.
- [ ] **Hosting and security:** the Worker on `*.workers.dev`, a staging Worker or preview versions for PRs, security headers graded A, and Cloudflare Web Analytics.
- [ ] **The ADRs** listed under "Architecture decisions".
- [ ] **Tests,** plus `REFERENCE/site.md` (how the site works) and updates to `REFERENCE/engine.md`, `REFERENCE/register.md`, the troubleshooting guide, the README and the CLAUDE.md files.

### Out of scope (later phases or deferred)
- The custom domain `energy.hultberg.org`, which Magnus adds when he judges the site close to a release.
- Postcodes and locations other than London. The form asks for no postcode while only London is modelled, and every result says "Modelled for a house in London".
- Full row-by-row overrides for enthusiasts.
- Calibration from a visitor's bills, and the Octopus smart-meter link.
- Looking up a home's EPC to pre-fill the form.
- Saving or sharing results. Nothing is stored, and nothing about the house goes in the URL (the analytics beacon reports page URLs).
- The 3D floating-island street (phase 4).
- Insulation and glazing upgrades as options, batteries and EVs.
- An automatic data refresh. The weekly CI check only reports.

### Acceptance criteria
- [ ] **Same numbers as the report:** for the 1930s semi with its default answers (boiler "needs replacing now"), the site's central values equal the phase 2 report's at display rounding. The test runs the site's code path in Node.
- [ ] **Speed,** on a mid-range phone profile (Playwright with Chrome's CPU throttled 4×):
  - the central result appears within 200 ms of the last input, after a 150 ms debounce;
  - the ranges for the default choice (six combinations) and for Agile (all ten) appear within 3 seconds;
  - Largest Contentful Paint is under 2.5 seconds (Lighthouse mobile profile).
- [ ] **Payload:** the first load is under 350 KB compressed, scripts and data together. Agile's rates load only when Agile is chosen. Zod is not in the browser bundle.
- [ ] **Caveats next to their numbers:** every caveat the report places next to a number appears next to the same number on the site. That covers the Agile limitations, the time-of-use assumptions, the issue 15 bias, VAT, a flagged archetype, a clipped solar size and "Modelled for a house in London". A test checks each against the shared text.
- [ ] **Provenance:** every number opens its top drivers and the full list of rows the run read. A test checks that every row shown has a source or a rationale, and that each number's drivers are rows the run read.
- [ ] **Quotes:** each quote replaces the model's distribution with the visitor's figure in every sample. It is labelled "your figure", and warned about gently outside the row's range. The heat pump quote handles the grant correctly whether or not it has already been taken off, with a test for each answer.
- [ ] **Boiler age:** every answer moves the reference boiler's first replacement as specified. "Needs replacing now" gives phase 2's payback exactly, in every sample. Hand-worked examples in `REFERENCE/engine.md` cover each answer, and tests reproduce them.
- [ ] **Staleness:** the function, given a date past the register's due dates, returns the stale rows, and the site shows the warning. The weekly CI check opens an issue when a row falls due.
- [ ] **Privacy:**
  - nothing the visitor enters leaves the browser or is stored, not even in local storage or the URL;
  - a headless browser test of the built site records no request to any origin but its own and Cloudflare Web Analytics' two origins;
  - analytics records page views only.
- [ ] **Security:** securityheaders.com grades the `*.workers.dev` site A or better. The content security policy is the one the spike settles, with the reasons in the framework ADR. Engine errors are shown as plain text, never as HTML.
- [ ] **Accessibility:** WCAG 2.2 AA. Axe passes on every page. The form and results work by keyboard alone. Results make sense to a screen reader: tables have headers, ranges are read as "from … to …", and a polite live region announces the central result and the arrival of the ranges.
- [ ] **The not-advice notice** appears on the results view and in every page footer.
- [ ] **The refresh checklist** is written and has been run for the January–March 2027 cap. The site's prices are in date at launch.
- [ ] **Quality:**
  - tests pass with coverage at 95% or above for lines, functions and statements and 90% or above for branches, on the engine and on the site's logic;
  - type checking, lint and the site build pass in CI;
  - the phase 2 report and `site-data.json` regenerate with no diff.

---

## Technical approach

### Architecture decisions

These need ADRs, which Magnus confirms, before the PR that relies on them is merged.

1. **The framework and hosting.**
   - The site is plain files: HTML, JavaScript and data. A Cloudflare Worker serves them as static assets and adds security headers. Nothing is calculated on a server.
   - Next.js static export is the plan. **Vite with React is the fallback** if spike check 1 or 3 fails; the spike switches without stopping for a new decision, and the ADR records which was used and why.
   - The engine stays a pure library with no framework dependency.
   - Code and data are readable by anyone, as for any website, and the repository is public. Protection comes from the licence, not from hiding the code.
2. **How visitor input reaches the engine.**
   - The house and quick facts go through the existing `House` input, extended with the boiler age.
   - A quote is a **visitor figure:** a separate input from the sampling overrides. It replaces the row's distribution in every sample, not only its default.
   - Only four rows accept visitor figures: `costs.heatPumpInstalled`, `costs.boilerInstalled`, `costs.pvPerKwp` (derived from a total solar cost and size), and the solar size. They are listed in the ADR, and a test pins the list.
   - This resolves the "how user overrides reach the engine" note.
3. **The licence:** MIT for the code. Data keeps its own terms, in a NOTICE file (see "Licence").

### The stack

- **The site:** Next.js with `output: 'export'`, React and TypeScript, styled with Tailwind CSS and shadcn/ui. Or the Vite fallback.
- **Hosting:** a Cloudflare Worker with static assets, configured with Wrangler. Headers go in the Worker or a `_headers` file, whichever the current Cloudflare docs recommend. Follow the `nextjs-on-cloudflare` skill and the current Cloudflare and Next.js docs at implementation time.
- **Deploys:** PRs deploy to a staging Worker or to Worker preview versions, never to the live beta address. Only merges to main deploy the live beta. Every page carries `noindex` until the launch PR.
- **Packages:**
  - the site lives in `site/` as an npm workspace, with its own tsconfig (DOM and WebWorker libs, bundler resolution, JSX);
  - `npm run typecheck` and Oxlint cover it;
  - the engine stays importable with no framework dependency.
- **New packages,** each under the [14-day rule](../REFERENCE/decisions/2026-10-18-fourteen-day-dependency-wait.md):
  - Next.js or Vite, React, Tailwind and shadcn/ui's dependencies, and Wrangler;
  - Playwright, for the origin test, axe and speed;
  - Testing Library with jsdom or happy-dom, for site coverage.

**The spike must prove four things before feature work starts:**
1. **TypeScript.** `next build` works with the repository's pinned TypeScript 7. Next.js loads the TypeScript API and may rewrite tsconfig even with its build check off. If that fails, the options are giving the site its own TypeScript version (which amends the TypeScript 7 ADR) or the Vite fallback. The spike records which it took.
2. **Imports and the worker.** The bundler accepts the engine's `.ts` import extensions, and the engine runs in a module web worker.
3. **Security policy.** Find a content security policy that reaches grade A. Next.js's App Router injects inline scripts per page, and a static export can't use per-request nonces. The spike tries Pages Router or hashed inline scripts first. If only `'unsafe-inline'` works, the spike checks securityheaders.com's grade with it before deciding between accepting it and the Vite fallback.
   - The policy must allow the module worker (`worker-src 'self'`, plus `blob:` only if the bundler needs it).
   - It must also allow Cloudflare Web Analytics on `static.cloudflareinsights.com` (the script) and `cloudflareinsights.com` (the reports). On `*.workers.dev` the beacon is added by hand as a snippet.
4. **Deploys.** The Worker serves the export on `*.workers.dev`, with the headers, from a deploy step Magnus can run, plus a staging or preview path for PRs.

### Engine changes for the site

- **Boiler age.**
  - **The answers:** "It needs replacing now" (the default), "Up to 4 years old", "5 to 9 years old" and "10 years or older".
  - **What "now" means:** "now" means the boiler is replaced in year 0 in every sample, whatever the sampled lifetime, so it gives phase 2's payback exactly.
  - **Ages for the other answers:** a `table` row maps them to 2, 7 and 12 years (approximate, with a rationale).
  - **Gas setups keep the boiler** (the reference, gas with solar, and either on Agile). They replace it when its remaining life runs out, in year max(1, sampled lifetime − age), then every lifetime after. A boiler due in year 0 counts as an upfront cost; a later one is a replacement.
  - **Heat pump setups** buy the heat pump now and never pay for the boiler.
  - **In code:** `replacementPounds` (`src/engine/payback.ts`) gains a first-replacement offset, and the gas setups' upfront becomes £0 when the boiler isn't due now. The site shows that as "£0 now: your boiler keeps going until year N".
  - This closes the boiler half of [#37](https://github.com/mannepanne/energy-sim/issues/37). `REFERENCE/engine.md` gains a hand-worked example for each answer.
- **Visitor figures** (see "Quotes" and "Architecture decisions" item 2).
  - **The heat pump quote** asks "Has the £7,500 grant already been taken off this quote?" If yes, the engine adds the grant back before applying it, so the grant is never taken off twice. The grant's cap at the heat pump's cost still applies.
  - **The solar quote:** a visitor's solar size takes its own path past the roof clip (`src/engine/inputs.ts`), so it is used as entered. A total solar cost requires the size, so £ per kWp is fixed in every sample.
  - **The boiler quote** applies to today's boiler and to every later boiler replacement, at today's real cost.
- **Display names in the register,** for archetypes, setups and tariffs. They are `table` rows of strings, read by the site and the report, which resolves the "display names" note.
- **Structured caveat text.**
  - **The format:** caveats become structured runs of plain text, bold and links, with link targets named (such as "the report's control section", "the schedules ADR") rather than written as relative paths.
  - **Rendering:** the report renders the runs to Markdown, and the site to React elements, never as raw HTML.
  - **Wording:** each caveat is reworded once to stand alone in either place.
  - The report regenerates with that reworded text, in one reviewed diff.
- **The browser sampler.**
  - Runs the visitor's chosen setups on the cap and on the chosen time-of-use tariff, at N=200. The reference (gas on the cap) always runs, shown or not, because payback and differences are measured against it.
  - Chunked, with a request id, so a newer request makes an older one stop between chunks.
  - Central values come from the same code path as the report.
- **Recording reads.** A wrapper around the register accessor records every row a run reads (fixed, uncertain, table and series), for provenance and staleness.
- **Staleness:** a function returns every recorded row that is past its due date or `validUntil` on a given date. The site passes the visitor's local date; the report keeps not reading the clock.
- **The VAT caveat's dates** come from a register row, not from text.
- **Build-time validation.** The register is validated with Zod at build time. The browser gets pre-validated JSON, and the site imports only the types, so Zod stays out of the bundle.
- **The Octopus snapshot is split** into Cosy and export (loaded up front) and Agile (loaded on demand). `loadOctopusSnapshot`, `agileFromSnapshot`, `scripts/fetch-octopus.ts` and the series rows change to match.

### Generated site data

`npm run site-data` writes `site/public/site-data.json`. It holds the values the browser can't compute:
- the issue 15 bias, from the HEM runs;
- each archetype's flag at its default answers, from the N=500 archetype run (this resolves the "flag warning" note: the flag belongs to the archetype and doesn't change with quick facts);
- the Agile window (which 12 months);
- each result's top drivers, from the sensitivity tables;
- the display names.

CI regenerates it and fails on a diff, as for the report. The site never imports from `scripts/`.

### The form

- **House type:** the ten archetypes, by display name.
- **Floor area:** in m², from 30 to 400, defaulting to the archetype's. Changing the house type resets it to the new default, unless the visitor has edited it.
- **Occupants:** 1 to "5 or more" (used as 5). Defaults from the floor area, as SAP's occupancy formula gives.
- **Loft, walls and glazing:** walls offer only the answers that fit the archetype. A wall answer that stops fitting after a house type change falls back to the default, and a short note says so.
- **Boiler age:** defaults to "needs replacing now".
- **Setups:** all four chosen by default.
- **Tariff:** the visitor picks a time-of-use tariff to show next to the cap: Cosy or Agile. The default is Cosy, the tariff most heat pump households would look at. Cosy is sold only to homes with a heat pump or electric heating, so with Cosy chosen the gas setups show the cap only, and their second column says "Cosy isn't available with a gas boiler". With Agile, every setup shows both.
- **Reset to defaults** is one control.
- **Errors:** inline, in plain text, next to the field.

Nothing the visitor enters is stored: no cookies, no local storage, nothing in the URL. A reload starts again.

### The results

- **A headline sentence** first, from the same generator as the report's "At a glance". For example: "For a house like yours, a heat pump costs about £X more up front and about £Y a year less to run on Cosy."
- **"Modelled for a house in London"** under the headline.
- **The flagged archetype warning,** when the house type is flagged, above the numbers, in the report's words.
- **For each chosen setup, on the cap and on the chosen tariff:**
  - running cost a year;
  - carbon a year;
  - upfront cost after the grant;
  - payback.
- **The ranges:** central first, then the 10th–90th percentile range once the worker finishes. Until then the range cells say "working out the range…".
- **Payback states:**
  - "year N";
  - "pays back at once" (year 0);
  - "cheaper up front, costs more to run";
  - "doesn't pay back within its lifetime";
  - a range end that falls on a sample that doesn't pay back reads "beyond its lifetime".
- **Solar's own payback** for each heating setup with solar.
- **"How often cheapest,"** in words:

  | Share | Words |
  | --- | --- |
  | 90% or more | almost always |
  | 65–90% | usually |
  | 35–65% | about half the time |
  | 10–35% | sometimes |
  | under 10% | rarely |

  The share and its noise (about ±7 points at N=200, the worst case at 95%) are in the provenance panel.
- **On a phone,** one card per setup, stacked, with the cap and the chosen tariff side by side in each card.
- **States:**
  - if the worker fails or takes more than 10 seconds, the central result stays and the range cells say ranges are unavailable;
  - if Agile's rates fail to load, the Agile column says so and offers a retry;
  - without JavaScript, the page explains that the calculator needs it.
- **The feedback link,** "Tell us what's wrong", opens a GitHub new-issue page with a fixed template. Nothing about the visitor's house is put in it automatically.

### Provenance

Each number opens a panel showing:
- **its top drivers:** up to five rows, ranked by their swing in the sensitivity tables, from `site-data.json`. Each shows its value, range, source or rationale, status and last-checked date;
- **"your figure"** for any quote the number uses, and the house answers it depends on;
- **"all the rows behind this result":** the full recorded list for the run, grouped by register section;
- the "how often cheapest" share and its noise, where relevant.

### Quotes

Four fields, each with a "use the model's figure" reset:
- **Heat pump installed cost,** with the grant question.
- **Boiler installed cost.**
- **Solar system size (kWp) and total solar cost.** The cost needs the size.

Rules:
- Values must be positive numbers. Zero, negative and non-numbers get an inline error.
- A figure outside the row's low–high range is accepted, with a note: "This is outside the range we usually see (£A to £B). We've used your figure."
- Quotes for setups that aren't chosen are kept, but have no effect until those setups are chosen.
- **A clipped solar size.** With no quote, a model size clipped to the roof shows "your roof fits about X to Y kWp", with the range from the sampled usable share. A quoted size is used as entered, with a note when it exceeds that range. East–west roofs are outside the model, and the solar note says so. This resolves the "clipped solar size" note.

**Errors** from the engine are shown as plain text, never as HTML, because some repeat the input value. This resolves the "engine errors" note.

### The worker and speed

- **The central result** runs on the main thread, after a 150 ms debounce. It takes about 3 ms for all combinations on a recent Mac.
- **The ranges** run in the web worker, in chunks, with a request id; a newer request stops an older one between chunks. The worker parses and prepares the data once and keeps it.
- **The bench on a recent Mac:** 500 samples of four setups take about 0.7 seconds, and all ten combinations about 1.4. At N=200 on a 4–6× slower phone, the default choice (six combinations: both heat pump setups on the cap and Cosy, both gas setups on the cap) is expected to take about 1–2 seconds, and all ten (Agile chosen) about 2–3.5 seconds. If either misses 3 seconds, N drops for that choice, and the stated noise rises with it.

### Content pages

- **How it works:** a plain-language summary of the model, linking to the phase 2 report and the repository.
- **Sources and credits:** every data source with its attribution and licence, generated from the register and the NOTICE file.
- **Privacy:**
  - nothing the visitor enters leaves their browser or is stored;
  - the site is served by Cloudflare, which processes visitors' IP addresses to deliver pages and for cookie-free page-view analytics;
  - no other third party is involved.
- **The not-advice notice:** "These are estimates for a typical house of this kind in London, not advice for your home, and not financial advice." It appears on the results view and in every page footer.
- **Beta:** every page says the site is a beta, a proof of concept.
- **Brand-neutral:** no char.gy branding until Magnus has agreed any involvement with his employer.
- **A 404 page.**
- **Browser support:** current versions of Chrome, Edge, Firefox and Safari, including iOS Safari, which supports module web workers.

### Staleness and data refresh

- **"Prices checked on"** shows the oldest `lastChecked` among the price rows the results read.
- **The warning:** when any recorded row is past its due date or `validUntil` on the visitor's local date, a banner says: "Some prices behind these results are out of date (checked on D). The results may not reflect today's prices."
  - **More than 90 days past due,** the banner is stronger: the results still show, with "out of date" next to every cost.
- **The weekly CI check** (a scheduled GitHub Action) runs the staleness function on today's date and opens an issue, or comments on the open one, when any row falls due. It refreshes nothing.
- **`REFERENCE/data-refresh.md`** lists, for each quarter:
  - which rows fall due;
  - the commands to re-fetch;
  - what to check in the diff;
  - the VAT row's dates;
  - regenerating the report and `site-data.json`;
  - opening the PR.

  It is run for the January–March 2027 cap, which Ofgem usually publishes in late November (the checklist gives the date to confirm), as part of PR 6.

### Licence

A separate small PR, before phase 3 PR 1:
- `LICENSE`: MIT for the code, copyright Magnus Hultberg.
- `NOTICE`: the data keeps its own terms. Before writing it, check:
  - the Octopus API's terms on republishing tariff data (the Octopus snapshot is committed in a public repository);
  - the terms on the Elexon download page for the profile class values;
  - the attribution PVGIS asks for;
  - the Open Government Licence attribution for Ofgem, NEED and DESNZ;
  - that nothing from the gitignored `REFERENCE/data-downloads/` is committed.
- An ADR for the licence decision.

If a source's terms forbid republishing its data, that data is reduced to the values the engine needs, or fetched at build time and not committed. Magnus may want to check his employment contract's IP terms before granting an open-source licence; that is his call.

### Testing strategy

**Engine (Vitest):**
- boiler age, including "now" in every sample;
- visitor figures, including both grant answers;
- the solar size's own path;
- the recording wrapper and the staleness function;
- the chunked sampler's central values against the report's;
- the caveat runs rendered to Markdown and to plain text;
- `site-data.json` drift.

**Site (Vitest with Testing Library):**
- the form's defaults, bounds, dependent defaults and reset;
- Cosy only for heat pump setups;
- every caveat next to its number;
- every number opening its provenance;
- payback states;
- errors rendered as text;
- loading and failure states.

**Built site (Playwright):**
- network requests go only to the site's origin and the two analytics origins;
- axe on every page;
- keyboard paths through the form and results;
- the payload budget;
- the speed checks under 4× CPU throttling.

**Manual checks before launch:** securityheaders.com on the live address, Lighthouse's mobile profile, and a VoiceOver pass on iOS and macOS.

**Coverage:** 95% for lines, functions and statements and 90% for branches, on the engine and on the site's logic. Pages that only lay out components are covered by the Playwright checks instead, which `REFERENCE/testing-strategy.md` records.

---

## Pre-commit checklist

- [ ] Tests pass, type checking and lint pass, the site builds, and coverage meets targets.
- [ ] `npm run report` and `npm run site-data` regenerate with no diff.
- [ ] The docs are updated: `REFERENCE/site.md`, `REFERENCE/engine.md`, `REFERENCE/register.md`, the troubleshooting guide, the README and the CLAUDE.md files.
- [ ] There is no debug output and there are no secrets. Any Cloudflare deploy token lives outside the repository.

---

## PR workflow

0. **Licence** (separate, before phase 3): `LICENSE`, `NOTICE` and the licence ADR.
1. `feature/phase-3-spike`:
   - the four spike checks;
   - the `site/` workspace and a deployed hello-world on `*.workers.dev`, running the central engine in a module worker;
   - the staging or preview path;
   - the headers graded;
   - the framework ADR, recording Next.js or the Vite fallback.
2. `feature/phase-3-engine-for-site`:
   - boiler age;
   - visitor figures and their ADR;
   - display names, structured caveats and the recording wrapper;
   - the chunked sampler and staleness;
   - the Octopus split and build-time validation;
   - `site-data.json`.

   The report regenerates, with the reworded caveats as the only intended change.
3. `feature/phase-3-form`: the form, defaults, bounds, setups and tariff choice.
4. `feature/phase-3-results`: the headline, the comparison, central then ranges, payback states, caveats, the flag warning, and loading and failure states.
5. `feature/phase-3-provenance-quotes`: provenance panels and quotes.
6. `feature/phase-3-content-and-data`: the content pages, the feedback link, staleness and the weekly CI check, the refresh checklist (run for the January 2027 cap) and the 404 page.
7. `feature/phase-3-launch`:
   - the Playwright checks, the budgets and accessibility;
   - securityheaders A;
   - analytics;
   - removing `noindex`;
   - the beta launch on `*.workers.dev`.

Run `/review-pr` on each.

---

## Edge cases and considerations

### Known risks
- **Next.js with TypeScript 7, and a content security policy on a static export.** The spike tests both first, and the Vite fallback is agreed.
- **Phone speed.** The default choice runs six combinations; all ten run when Agile is chosen. If the ranges miss 3 seconds, N drops and the stated noise rises.
- **Stale data at launch.** The cap rows expire on 31 December 2026, so PR 6 refreshes them to the January–March 2027 cap.
- **Data licences.** The licence PR checks each source first.
- **Neutrality.** Every setup is shown the same way, on the cap and on the chosen tariff. The cheapest is highlighted by the numbers alone, never by design emphasis.
- **Floating-point differences between browsers.** "Same as the report" is tested at display rounding in Node, because Safari's maths functions aren't bit-identical to Node's.

### Security
- No server, no accounts, and no personal data stored or sent.
- Security headers graded A, and a content security policy limited to the site's own origin, its worker and the analytics origins.
- Errors rendered as text, and visitor input validated before it reaches the engine.
- The deploy token stays outside the repository.

---

## Technical debt

Carried forward from phase 2, unchanged: [#14](https://github.com/mannepanne/energy-sim/issues/14)–[#17](https://github.com/mannepanne/energy-sim/issues/17), [#24](https://github.com/mannepanne/energy-sim/issues/24)–[#27](https://github.com/mannepanne/energy-sim/issues/27), [#34](https://github.com/mannepanne/energy-sim/issues/34), [#39](https://github.com/mannepanne/energy-sim/issues/39) and [#43](https://github.com/mannepanne/energy-sim/issues/43)–[#45](https://github.com/mannepanne/energy-sim/issues/45).

[#37](https://github.com/mannepanne/energy-sim/issues/37) is partly closed by the boiler-age answer; its "undiscounted" half carries forward.

New, tracked when their code lands:
- London only, with no postcode;
- a short quote list rather than full overrides;
- N=200 in the browser against N=500 in the report;
- archetype flags fixed at default answers;
- a manual data refresh.

---

## Related documentation

- [Project outline](./ORIGINAL_IDEA/project-outline.md) and [model and register spec](./ORIGINAL_IDEA/home-energy-simulator-spec.md)
- [Phase 2 spec (archived)](./ARCHIVE/02-complete-v1-model.md) and the [phase 2 report](../reports/phase-2-v1-model.md)
- [engine.md](../REFERENCE/engine.md) and [register.md](../REFERENCE/register.md)
- [ADR: client-side, build-time snapshots](../REFERENCE/decisions/2026-10-17-client-side-build-time-snapshots.md)
- [ADR: TypeScript 7 with Oxlint](../REFERENCE/decisions/2026-10-17-typescript-7-with-oxlint.md)
- [ADR: 14-day dependency wait](../REFERENCE/decisions/2026-10-18-fourteen-day-dependency-wait.md)
