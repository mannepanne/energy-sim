# Project outline

Source of truth for the project's original intent. Detailed model and data design lives in [home-energy-simulator-spec.md](./home-energy-simulator-spec.md). The idea's background is in [origin-notes.md](./origin-notes.md).

---

## What this is

A free public website where a homeowner in England describes their house and compares whole-house energy setups side by side, such as a gas boiler versus a heat pump, with or without solar, on different tariffs. It shows what each setup would cost, how much carbon it emits and how quickly it pays back, as honest ranges rather than single numbers.

Think of the calculators and simulators on Moneysupermarket.com, but for the whole house rather than a single product.

---

## Why this exists

- **For the public:** people considering a heat pump, solar or insulation face big, expensive decisions. Most existing tools look at one product at a time, or hide their assumptions. This tool answers "what should I do first, and is it worth it for my kind of house?" and shows where every number comes from.
- **For Magnus:** it is a showcase of defining and building a non-trivial product with an AI coding assistant. The spec, decision records, phased plans and PR reviews are part of the evidence, not only the finished site.
- **Possibly for char.gy:** it may become a brand-awareness asset for Magnus's employer, subject to a conversation with them (see constraints).

---

## Who it's for

- **Primary:** members of the public in England who own their house and are curious or actively deciding about energy upgrades. They are not experts and may not know what a U-value or SPF is.
- **Secondary:** enthusiasts and professionals (retrofit assessors, installers, people in the EV and energy industries). They want to open the bonnet, check the assumptions and override them.
- **Stakeholders:** Magnus (owner), the friends who will test it on their own homes, and potentially char.gy.

---

## Core features (in scope for v1)

v1 leads with the numbers. It proves the engine and the trust story before any 3D work.

- **One location** to start (London or Canterbury), with the architecture ready for any postcode in England.
- **Describe your house:** pick a house archetype (type, age band, size), then answer a quick-facts form covering loft and wall insulation, glazing, current heating and occupants.
- **Compare setups:** gas boiler versus air source heat pump, each with or without roof solar.
- **Tariffs:** the Ofgem price cap (flat rate) plus Octopus time-of-use tariffs via their public API.
- **Results as ranges:** annual cost, carbon, upfront cost after grants and payback, shown as low, central and high values, side by side.
- **Transparency:** every number traces back to the parameter register, with its source, range and last-checked date, one click away.
- **A simple 2D comparison view** of the results.

---

## Next step we really want: the 3D street

As soon as v1's numbers are proven, the next major phase is the **floating-island street**. It is a low-poly 3D diorama: a little island floating in space with chunky cartoon houses, each with a different setup. Panels catch the moving sun, a gas boiler puffs from its flue, and a car plugs in at night. It is animated across a day and a year, and drawn entirely from the engine's results.

This is a committed ambition, not a nice-to-have. It is the tool's most shareable feature, it carries the marketing value, and it is the best showcase of the build. It is deferred only so that it sits on numbers we already trust. The visualisation only reads results, so it can be polished freely without changing them.

---

## Explicitly out of scope

**Deferred beyond v1:**
- The 3D floating-island street (the next phase, see above).
- Calibration from last year's bills, including the Octopus smart-meter data link.
- Home batteries, EVs and EV charging, including an on-street charging option for homes without a driveway.
- Insulation and glazing upgrades as comparable options. v1 describes the current house but doesn't model these upgrades.
- Postcodes across all of England, beyond the first location.
- Wales and Scotland.
- Monetisation (referrals or similar), only if the site gets traffic and proves useful.

**Not planned:**
- Flats, Northern Ireland and commercial buildings.
- Exact predictions for a specific house. The tool gives defensible ranges, not a survey.
- Financial advice. The tool estimates; it doesn't recommend purchases.

---

## What "good" looks like

- **Right on the decisions:** for a given house, the tool ranks options the way measured data would. In v1 that means gas boiler versus heat pump, each with and without solar. Ranking insulation and glazing upgrades against solar comes when those upgrades are added.
- **Honest numbers:** on real homes with known bills (Magnus's and friends'), uncalibrated estimates land within about ±25% for most homes.
- **Experts agree:** a retrofit assessor or heat pump installer, and Magnus's EV-industry friend, review the register and broadly sign it off.
- **Visitors understand it:** someone with no energy knowledge gets a result in about a minute and understands what it tells them.
- **A showcase Magnus is proud of:** a clean repo and decision trail that demonstrate the AI-assisted way of working.
- **Later:** the 3D street gets shared, and there is enough traffic to make monetisation worth considering.

---

## Constraints and assumptions

- **Side project:** built in Magnus's own time, on low or no hosting cost.
- **Neutrality is a principle:** results are never influenced by commercial relationships, now or if referrals are added later.
- **Privacy by design:** postcodes and household details are personal data under UK GDPR. The working assumption is that everything stays in the visitor's browser and nothing personal is stored on a server. This is to be confirmed as an architecture decision.
- **Data goes stale:** the price cap changes quarterly, and grants and tariffs change too. Each source needs a last-checked date and a scheduled refresh, or the public site becomes misleading.
- **Not advice:** the site must state clearly that results are estimates and not financial advice.
- **Employer:** before the project grows or carries any char.gy association, Magnus checks his employment contract for IP terms covering related side projects, and agrees any brand use with char.gy. Until then, the site is brand-neutral.
- **Assumption:** the simplified hourly engine can get within about ±15% of the government's Home Energy Model (HEM) on annual space heating. This is to be proven early.

---

## Open questions

- Will the repo be public as part of the showcase?
- Which first location: London or Canterbury?
- What will the site be called, and on what domain?
- How will char.gy be involved, if at all, and what does Magnus's contract say?
- Should flats come into scope later? They matter for char.gy's on-street charging audience.
- The model questions listed in the spec: hybrid systems, a server-side HEM "detailed check" mode, and whether a typical-year Agile tariff profile is fair.

---

## Naming and inspiration

- **The idea** came from a friend in the EV industry who wanted a whole-house "SimCity house" savings calculator. He pointed to [carbonfree.finance](https://carbonfree.finance/).
- **The visual** was inspired by Christian Nilsson's 3D AI-agent village ([simulation](https://kanzie.com/nexus/village/index.html?v=1.19.4)). We will build our own aesthetic, not copy his.
- **The tone** is Moneysupermarket-style calculators: free, practical and approachable for the general public.
- **The name** is to be decided. `energy-sim` is a working title.

---

*Last updated: 2026-10-17*
