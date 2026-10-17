# ADR: Fully client-side site with build-time data snapshots

**Date:** 2026-10-17
**Status:** Active
**Supersedes:** N/A

---

## Decision

The simulator runs entirely in the visitor's browser. External data (weather and solar, tariffs, carbon intensity) is fetched by build-time scripts, validated, and committed to the repo as versioned snapshots. The engine never calls an external API at run time, and no server receives or stores a visitor's details.

## Context

Visitors will enter a postcode, details of their house, and later their bills. Under UK GDPR all of that is personal data. The project is a free side project with no budget for running or securing a backend that holds personal data.

The engine needs large reference datasets: an hourly typical weather year, tariff rate schedules and carbon profiles. The main weather and solar source, PVGIS, [does not allow browser (AJAX) calls](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en) and says requests to change its CORS policy will be refused. Live browser fetching of PVGIS was therefore never an option.

## Alternatives considered

- **A backend API that runs the engine:** visitor inputs go to a server, which returns results.
  - Why not: personal data reaches a server, which brings GDPR obligations, security work and hosting cost. It is also slower than running locally.
- **Live API calls from the browser:** fetch weather and tariffs when the visitor submits.
  - Why not: PVGIS blocks it. Results would also depend on third-party uptime and couldn't be reproduced or tested.
- **A thin caching proxy:** a Cloudflare Worker fetches and caches PVGIS by location; the engine stays in the browser.
  - Not now: it adds a server component before we need one. It remains the likely option once every postcode in England is covered (see Implications).
- **Build-time snapshots, engine in the browser:**
  - **Chosen:** no personal data leaves the browser, runs are reproducible, and tests are deterministic.

## Reasoning

**Privacy by design:**
- Nothing personal is transmitted, so there is nothing to breach, retain or delete.
- No consent banner or data processing agreement is needed for the core tool. Cookie-free analytics stays compatible.

**Trust and testability:**
- Every snapshot has a source, a fetch date and a schema, which matches the register's provenance rules.
- The same inputs always give the same outputs, so the committed report can be checked for drift in CI.

**Cost and simplicity:**
- The site can be static files on Cloudflare, with no server code to secure in v1.

## Trade-offs accepted

**Data goes stale between rebuilds:**
- The price cap changes quarterly, grants change, and Agile rates change daily.
- Accepted: each data source has a refresh cadence in the register, and results show the date their data was last checked. Refreshing is a scheduled rebuild.

**Repository and bundle size grow with coverage:**
- One typical year is about 8,760 rows per location.
- Accepted for one location in v1. Snapshots are trimmed to the columns the engine uses.

**No server-side logic is possible without revisiting this ADR:**
- Accepted: v1 needs none.

## Implications

**Enables:**
- A static, low-cost deployment with no backend in v1.
- Reproducible results, and a committed report that CI checks for drift.
- A simple privacy statement: "your details never leave your browser".

**Prevents or complicates:**
- **Covering every postcode in England** needs either a pre-built set of snapshots (for example one per postcode district, which is large) or a small caching proxy for PVGIS. That proxy would receive only coordinates for a district, not personal data. It needs a follow-up decision when we leave the single location.
- **Octopus smart-meter calibration (later)** needs the visitor's API key to call Octopus. It must happen directly from the browser to Octopus, if Octopus allows that, or through a proxy that never logs or stores the key. That needs its own decision.

---

## References

- [PVGIS API non-interactive service (EU JRC)](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en)
- [Phase 1 spec](../../SPECIFICATIONS/01-engine-core.md)
- [Project outline](../../SPECIFICATIONS/ORIGINAL_IDEA/project-outline.md), "Constraints and assumptions"
