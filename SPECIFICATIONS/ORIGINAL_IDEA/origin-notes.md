# Origin notes

Context from the claude.ai conversation that produced [home-energy-simulator-spec.md](./home-energy-simulator-spec.md). Summarised from excerpts Magnus pasted on 2026-10-17.

## Where the idea came from

- **A friend in the EV industry** suggested a "how much could I save by going electric" calculator for the whole house, not just the car. He described it as "a bit like a SimCity house": you add tech (solar, battery, heat pump) and change variables such as operating times and tariffs. He pointed to [carbonfree.finance](https://carbonfree.finance/) as a good existing example.
- **Input style Magnus wants:** like carbonfree.finance. Pick a house type, then options such as loft insulated or not, single or triple glazing, decade built, gas boiler, roof solar, heat pump. Then see the savings compared with another setup.
- **Visual inspiration:** another friend, Christian Nilsson, built a 3D game-like visualisation of his AI agents as a village ([LinkedIn article](https://www.linkedin.com/pulse/takes-village-exercise-ai-agent-orchestration-christian-nilsson-db7ze/), [live simulation](https://kanzie.com/nexus/village/index.html?v=1.19.4)). That prompted the idea of a street of houses with different setups, compared on cost and energy efficiency.

## The goal as Magnus framed it

An interactive tool that shows genuinely useful information to people exploring how to save money on energy and make their homes more efficient.

## Points agreed in the conversation

- **Trustworthy means:** right on the decisions (for example, heat pump or not, insulation before solar), close enough on the numbers, shown as ranges, and fully transparent. It does not mean exactly right for every house.
- **Behaviour matters more than the building.** Identical houses can differ by 30–50% in energy use. Calibrating against last year's bills is the single biggest accuracy lever.
- **Maintenance is ongoing.** The price cap changes quarterly, and grants and tariffs change too. Each data source needs a "last checked" date and a scheduled refresh job.
- **Tariffs:** Octopus has a public API. Other suppliers need manual entry or curated data.
- **Validation:** run the model on real houses with known bills (Magnus's, friends', colleagues'). Get the EV-industry friend, and ideally a retrofit assessor or heat pump installer, to sanity-check the assumptions.
- **Visualisation:** a low-poly floating-island diorama in Three.js, with chunky cartoon houses, panels catching the moving sun, a puff from the gas boiler flue and a car plugging in at night. It uses our own aesthetic and doesn't copy Christian's. It only reads engine results, so polishing it can't change the numbers.
- **The register is one data file**, the single source of truth. The spec groups it into sections only for reading, and those sections should map to sections of the UI.
- **The EV gets its own register section.** To the house, an EV is just a large charging load that interacts with tariffs and batteries.
- **v1 covers England only.** Wales (which shares England's Boiler Upgrade Scheme) and Scotland come in a later phase.
- **The first step was the parameter register and model spec**, before any simulation code. The spec is now done.
