// ABOUT: Builds the phase 1 report (reports/phase-1-london-semi.md) from the register and the PVGIS snapshot
// ABOUT: Pure and clock-free: the same inputs always give byte-identical Markdown

import { compare, centralOutsideBand, runPaired, type Band, type Comparison, type Metric, type PairedRun } from '../../src/engine/compare.ts';
import { heatLoss } from '../../src/engine/geometry.ts';
import {
  archetypeFacts,
  defaultHouse,
  REFERENCE_ARCHETYPE,
  type GlazingAnswer,
  type House,
  type LoftAnswer,
  type WallAnswer,
  type WallConstruction,
} from '../../src/engine/archetypes.ts';
import { ARCHETYPE_NAMES } from '../archetypes/table.ts';
import { readInputs, uncertainDraws } from '../../src/engine/inputs.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import { sensitivity, type SensitivityRow } from '../../src/engine/sensitivity.ts';
import type { Setup } from '../../src/engine/simulate.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { createAccessor, type RegisterAccessor } from '../../src/register/access.ts';
import { dueDate } from '../../src/register/load.ts';
import { STATUSES, type Register } from '../../src/register/schema.ts';
import type { PvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { hemResult } from '../benchmark/comparison.ts';
import { HEM_RUNS } from '../benchmark/hemInput.ts';
import { gapFromReference } from '../benchmark/needReference.ts';
import { roughEstimate } from '../benchmark/roughEstimate.ts';
import { NEED_GAS_RANGE_KWH, NEED_GAS_TARGET_KWH } from '../calibration/meanInternalTemperature.ts';
import { exactNumber, kgCo2e, kwh, plainValue, pounds, share, signedPercent, wholeNumber } from './format.ts';

/**
 * The method settings for the committed report. They are not house parameters, so they live here rather than
 * in the register. At 500 samples the share of wins has a standard error of about 2 percentage points.
 */
export const REPORT_PLAN: SamplingPlan = { seed: 1, count: 500 };

export const REPORT_PATH = 'reports/phase-1-london-semi.md';

const SETUP_NAMES: Record<Setup, string> = { gas: 'Gas boiler', heatPump: 'Heat pump' };

const METRIC_ROWS: readonly { metric: Metric; label: string; format: (value: number) => string }[] = [
  { metric: 'spaceHeatKwh', label: 'Space heat', format: kwh },
  { metric: 'hotWaterKwh', label: 'Hot water heat', format: kwh },
  { metric: 'gasKwh', label: 'Gas', format: kwh },
  { metric: 'electricityKwh', label: 'Electricity', format: kwh },
  { metric: 'costPounds', label: 'Running cost', format: pounds },
  { metric: 'carbonKg', label: 'Carbon (kgCO₂e)', format: kgCo2e },
];

const pence = (value: number): string => `${value.toFixed(2)}p`;
const air = (celsius: number): string => `${celsius.toFixed(1)} °C`;

const range = (low: string, high: string): string => (low === high ? low : `${low} to ${high}`);

const bandCells = (value: Band, format: (value: number) => string): string =>
  `${format(value.central)} | ${format(value.median)} | ${range(format(value.p10), format(value.p90))}`;

function resultsSection(comparison: Comparison): string {
  return [
    '## Results for each setup',
    '',
    '### Gas boiler',
    '',
    resultsTable(comparison, 'gas'),
    '',
    '### Heat pump',
    '',
    resultsTable(comparison, 'heatPump'),
    '',
    'Hot water heat is higher for the heat pump because its hot water cylinder loses heat all day; the gas combi boiler heats water as it is used and has no cylinder.',
  ].join('\n');
}

function variantSection(comparison: Comparison): string {
  const { costDifference } = comparison;
  return [
    '## The variant with no loft insulation',
    '',
    `With no loft insulation, the house needs more heat: ${kwh(comparison.bands.gas.spaceHeatKwh.central)} of space heat a year, central. Gas minus heat pump running cost is ${pounds(costDifference.central)} central (${range(pounds(costDifference.p10), pounds(costDifference.p90))}), and the heat pump is cheaper in ${share(comparison.shareHeatPumpCheaper)} of samples. The same samples and the same bias (issue 15) apply.`,
  ].join('\n');
}

function resultsTable(comparison: Comparison, setup: Setup): string {
  const rows = METRIC_ROWS.map(({ metric, label, format }) => `| ${label} | ${bandCells(comparison.bands[setup][metric], format)} |`);
  return ['| A year | Central | Median | 10th to 90th percentile |', '| --- | ---: | ---: | ---: |', ...rows].join('\n');
}

/** Plain sentences for every band whose central value falls outside P10–P90. */
export function outsideBandNotes(comparison: Comparison): string[] {
  const notes: string[] = [];
  for (const setup of ['gas', 'heatPump'] as const) {
    for (const { metric, label } of METRIC_ROWS) {
      if (centralOutsideBand(comparison.bands[setup][metric])) {
        notes.push(`- ${SETUP_NAMES[setup]}, ${label.toLowerCase()}: the central value lies outside the 10th to 90th percentile band, because the ranges are skewed.`);
      }
    }
  }
  if (centralOutsideBand(comparison.costDifference)) notes.push('- The cost difference: the central value lies outside the 10th to 90th percentile band, because the ranges are skewed.');
  if (centralOutsideBand(comparison.carbonDifference)) notes.push('- The carbon difference: the central value lies outside the 10th to 90th percentile band, because the ranges are skewed.');
  return notes;
}

/** The 95% Monte Carlo margin on a share from `count` samples, in whole percentage points (at least 1). */
export function marginPoints(fraction: number, count: number): number {
  return Math.max(1, Math.round(1.96 * Math.sqrt((fraction * (1 - fraction)) / count) * 100));
}

function comparisonSection(comparison: Comparison, count: number): string {
  const { costDifference, carbonDifference } = comparison;
  const notes = outsideBandNotes(comparison);
  return [
    '## Gas boiler versus heat pump',
    '',
    'Both setups run on the same samples, so each sample compares the same house and household with different kit. The difference is gas minus heat pump: a positive cost difference means the heat pump is cheaper to run, and a positive carbon difference means it emits less.',
    '',
    '| Gas minus heat pump, a year | Central | Median | 10th to 90th percentile |',
    '| --- | ---: | ---: | ---: |',
    `| Running cost | ${bandCells(costDifference, pounds)} |`,
    `| Carbon (kgCO₂e) | ${bandCells(carbonDifference, kgCo2e)} |`,
    '',
    `**The heat pump is cheaper to run in ${share(comparison.shareHeatPumpCheaper)} of samples** (rounded to the nearest 5%; an exact tie counts as half). With ${wholeNumber(count)} samples, this share carries sampling noise of about ±${marginPoints(comparison.shareHeatPumpCheaper, count)} percentage points. That is noise from the method, not the real-world uncertainty, which the ranges above show.`,
    '',
    '**This running-cost comparison leans in the heat pump’s favour.** One calibrated mean internal temperature, taken from gas-heated homes, applies to both setups. Heat pump households often heat for longer, so the heat pump’s running cost is likely too low here, and the share of samples in which it is cheaper too high ([issue 15](https://github.com/mannepanne/energy-sim/issues/15)). The model does not yet give the two setups different temperatures.',
    ...(notes.length > 0 ? ['', ...notes] : []),
  ].join('\n');
}

function sensitivitySection(access: RegisterAccessor, rows: readonly SensitivityRow[]): string {
  const inputs = readInputs(access);
  const gasPence = inputs.gasUnitRatePence / inputs.boilerSeasonalEfficiency;
  const heatPumpPence = inputs.electricityUnitRatePence / inputs.heatPumpSpf;
  const lines = rows.map((row) => {
    const unit = row.unit === 'ratio' ? '' : ` ${row.unit}`;
    const values = `${plainValue(row.low.value)} to ${plainValue(row.high.value)}${unit}`;
    return `| ${row.label} | ${values} | ${range(pounds(row.low.costPounds.gas), pounds(row.high.costPounds.gas))} | ${range(pounds(row.low.costPounds.heatPump), pounds(row.high.costPounds.heatPump))} | ${range(pounds(row.low.costDifferencePounds), pounds(row.high.costDifferencePounds))} |`;
  });
  return [
    '## Sensitivity',
    '',
    'Each uncertain row is run at its low and then its high value, with every other row at its default. The rows are ranked by how much they move the cost difference.',
    '',
    `At the central values, a kWh of heat costs almost the same from either system: ${pence(gasPence)} from the boiler (${inputs.gasUnitRatePence}p ÷ ${inputs.boilerSeasonalEfficiency}) and ${pence(heatPumpPence)} from the heat pump (${inputs.electricityUnitRatePence}p ÷ ${inputs.heatPumpSpf}). So rows that change how much heat the house needs, such as fabric quality or the temperature, move both running costs by hundreds of pounds but barely move the difference. The difference turns on the SPF and the boiler efficiency, and on the gas standing charge the heat pump house does not pay. Base electricity use moves both setups equally.`,
    '',
    'The low and high are the ends of each row’s range, not percentiles. For the heat pump SPF, they are the clip limits of its lognormal distribution, far out in its tails, so its row shows an extreme spread.',
    '',
    '| Row | Low to high | Gas boiler cost | Heat pump cost | Gas minus heat pump |',
    '| --- | --- | ---: | ---: | ---: |',
    ...lines,
  ].join('\n');
}

/** The price period, taken from the end of the electricity unit rate row's label, so it updates with the row. */
export function pricePeriod(access: RegisterAccessor): string {
  return access.fixed('prices.electricityUnitRate').label.split(', ').at(-1)!;
}

const WALL_WORDS: Record<WallConstruction, Record<WallAnswer, string>> = {
  cavity: { asBuilt: 'cavity walls as built', cavityFilled: 'filled cavity walls', solidWallInsulated: 'insulated cavity walls' },
  solidBrick: { asBuilt: 'solid brick walls as built', cavityFilled: 'filled cavity walls', solidWallInsulated: 'insulated solid brick walls' },
};
const LOFT_WORDS: Record<LoftAnswer, string> = { none: 'no loft insulation', about100mm: 'about 100 mm of loft insulation', '270mmOrMore': '270 mm or more of loft insulation' };
const GLAZING_WORDS: Record<GlazingAnswer, string> = {
  single: 'single glazing',
  olderDouble: 'double glazing installed before 2002',
  newerDouble: 'double glazing installed in 2002 or later',
};

function houseSection(access: RegisterAccessor): string {
  const inputs = readInputs(access);
  const facts = archetypeFacts(access, inputs.house.archetype);
  return [
    '## The house',
    '',
    `${ARCHETYPE_NAMES[inputs.house.archetype]}, in London (RdSAP age band ${facts.ageBand}): ${plainValue(inputs.house.floorAreaM2)} m² over ${facts.storeys === 1 ? 'one storey' : `${facts.storeys} storeys`}, ${WALL_WORDS[facts.wallConstruction][inputs.house.walls]}, ${LOFT_WORDS[inputs.house.loft]} and ${GLAZING_WORDS[inputs.house.glazing]}, with ${inputs.house.occupants} occupants. This is the main case; the variant with no loft insulation has a short section of its own below.`,
    '',
    `- Geometry, derived from the floor area and the footprint shape: ${plainValue(Math.round(inputs.exposedPerimeterM * 10) / 10)} m of exposed perimeter, ${plainValue(Math.round(inputs.externalWallAreaM2))} m² of external wall and ${plainValue(Math.round(inputs.windowAreaM2 * 10) / 10)} m² of windows. The ground floor U-value is ${inputs.groundFloorUValue} W/m²K (BS EN ISO 13370, as RdSAP 10 applies it).`,
    `- Heat loss coefficient (central): ${wholeNumber(heatLoss(inputs).totalWPerK)} W/K, including a party wall and thermal bridging.`,
    `- Mean internal air temperature (central): ${plainValue(inputs.meanInternalTemperatureC)} °C, held continuously.`,
    `- Prices: the Ofgem price cap, GB average by Direct Debit, for ${pricePeriod(access)}. Electricity ${inputs.electricityUnitRatePence}p a kWh and ${inputs.electricityStandingChargePencePerDay}p a day; gas ${inputs.gasUnitRatePence}p a kWh and ${inputs.gasStandingChargePencePerDay}p a day. The heat pump house has no gas supply, so it pays no gas standing charge.`,
    `- Carbon: ${inputs.gasCarbonKgPerKwh} kgCO₂e a kWh of gas and ${inputs.gridCarbonKgPerKwh} kgCO₂e a kWh of grid electricity (annual average).`,
  ].join('\n');
}

function methodSection(register: Register, access: RegisterAccessor, run: PairedRun): string {
  const uncertain = uncertainDraws(access, run.house).map((draw) => draw.label);
  const labels = new Map(register.rows.map((row) => [row.id, row.label.toLowerCase()]));
  const correlations = access.correlations().map((row) => `${labels.get(row.between[0])} and ${labels.get(row.between[1])} (${plainValue(row.value)})`);
  return [
    '## How the ranges are made',
    '',
    `- **Samples:** ${wholeNumber(run.plan.count)} joint samples with seed ${run.plan.seed}. Each sample draws a value for every uncertain row: ${uncertain.join('; ')}. Every other number is fixed.`,
    '- **Stable draws:** each value comes from a hash of the seed, the sample number and the row id, passed through the row’s inverse distribution function. Triangular rows use their default as the mode. The SPF is lognormal and clipped to its low and high.',
    '- **Central** is the run with every row at its default. **Median** and the **10th to 90th percentile** come from the samples (linear interpolation between ranked samples).',
    '- **Fabric quality** is one shared factor on every U-value and the air change rate.',
    `- **Correlated rows:** a Gaussian copula correlates ${correlations.join('; ')}, in normal-score space. The other rows are drawn independently of each other.`,
    '- **Rounding:** costs to £10, energy to 100 kWh, carbon to 10 kg and shares to 5%.',
  ].join('\n');
}

function hemRun(name: string): (typeof HEM_RUNS)[number] {
  const run = HEM_RUNS.find((candidate) => candidate.name === name);
  if (!run) throw new Error(`No HEM run named "${name}"`);
  return run;
}

function benchmarkSection(centralGasKwh: number): string {
  const main = hemRun('main');
  const matched = hemRun('thermostat-17');
  const rough = roughEstimate(main.options.roofUValueWPerM2K).annualSpaceHeatKwh;
  const hemMain = hemResult(main);
  const hemMatched = hemResult(matched);
  return [
    '## Benchmark and calibration',
    '',
    'The benchmark checked annual **space heat** against the government’s Home Energy Model (HEM), using a rough calculation for the same house, before the engine was built. The rule set in advance: proceed if within 15%, add thermal mass between 15% and 30%, and stop above 30%.',
    '',
    `- **The pre-registered check missed the rule.** HEM gave ${kwh(hemMain.spaceHeatKwh)} at its own settings (about ${air(hemMain.meanAirTemperatureWhenHeatingC)} of air), and the rough calculation at 18 °C of air gave ${kwh(rough)}: a gap of ${signedPercent(gapFromReference(rough, hemMain.spaceHeatKwh), 1)}, just outside 15%.`,
    `- **The rule was amended after seeing that result** (Magnus, 17 October 2026). HEM’s thermostat controls the felt (operative) temperature, which runs below the air temperature, while this engine uses air temperature. So the check compares like with like: at about ${air(hemMatched.meanAirTemperatureWhenHeatingC)} of air, HEM gives ${kwh(hemMatched.spaceHeatKwh)}, a gap of ${signedPercent(gapFromReference(rough, hemMatched.spaceHeatKwh), 1)}. **Decision: proceed with no thermal mass.** A test keeps the engine itself within 10% of that HEM run.`,
    `- **Both models predict more gas than comparable homes use.** Three ways of reading NEED, the government’s measured gas use data, give ${wholeNumber(NEED_GAS_RANGE_KWH.low)} to ${wholeNumber(NEED_GAS_RANGE_KWH.high)} kWh of gas a year for a typical home like this one. That is the spread between the readings, not between real homes, which vary far more. NEED has no 1930–49 age band, so its 1919–44 band stands in for this house. **Decision: calibrate the mean internal temperature** so the central gas use hits the midpoint, ${wholeNumber(NEED_GAS_TARGET_KWH)} kWh, a target fixed before the engine existed. Here the central gas use is ${kwh(centralGasKwh)}.`,
    '- The full write-up is in [scripts/benchmark/README.md](../scripts/benchmark/README.md), and the decisions are in the [calibration ADR](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md).',
  ].join('\n');
}

function dataDatesSection(register: Register, snapshot: PvgisSnapshot): string {
  const statusCounts = STATUSES.map((status) => `${register.rows.filter((row) => row.status === status).length} ${status}`).join(', ');
  const checked = register.rows.map((row) => row.lastChecked).toSorted();
  const due = register.rows
    .flatMap((row) => {
      const by = dueDate(row);
      return by === undefined ? [] : [{ id: row.id, lastChecked: row.lastChecked, by }];
    })
    .toSorted((a, b) => (a.by === b.by ? (a.id < b.id ? -1 : 1) : a.by < b.by ? -1 : 1));
  return [
    '## Data dates',
    '',
    `- **Register:** ${register.rows.length} rows (${statusCounts}), last checked between ${checked[0]} and ${checked[checked.length - 1]}. A sourced row has been checked against its source; a to-verify row is taken from a source but not yet checked line by line; an approximate row is an estimate with a written reason. See [register.md](../REFERENCE/register.md).`,
    `- **Weather:** the PVGIS typical year for ${exactNumber(snapshot.location.latitude)}, ${exactNumber(snapshot.location.longitude)} (${snapshot.radiationDatabase}), fetched on ${snapshot.fetchedOn}. ${snapshot.attribution}`,
    '- **Rows due for a fresh check** (the rest are static). A price row falls due when its price cap period ends:',
    '',
    '| Row | Last checked | Due by |',
    '| --- | --- | --- |',
    ...due.map((row) => `| \`${row.id}\` | ${row.lastChecked} | ${row.by} |`),
  ].join('\n');
}

const LIMITATIONS = [
  '## Limitations',
  '',
  '- **One calibrated temperature applies to both setups.** It comes from gas-heated homes, and heat pump households often heat for longer, so the heat pump’s running cost is biased low ([issue 15](https://github.com/mannepanne/energy-sim/issues/15)). It may also absorb errors in the default U-values ([issue 14](https://github.com/mannepanne/energy-sim/issues/14)).',
  '- **No thermal mass, and continuous heating** to one temperature ([issue 13](https://github.com/mannepanne/energy-sim/issues/13)).',
  '- **The heat pump’s hourly COP follows a curve scaled to the sampled SPF.** On the price cap with continuous heating, the curve changes when electricity is used, not how much: the year’s heat ÷ electricity equals the sampled SPF. The heat pump has no capacity limit and no backup heater.',
  '- **Fixed prices and one typical weather year** ([issue 16](https://github.com/mannepanne/energy-sim/issues/16)), and an **annual average grid carbon factor** ([issue 17](https://github.com/mannepanne/energy-sim/issues/17)).',
  '- **Only the per-occupant gains and hot water terms are correlated.** Their correlation (0.5) is an estimate with no source. Every other uncertain row is drawn independently.',
  '- **Constant internal gains**, and windows split equally over four orientations.',
  '- The gas carbon factor still needs a line-by-line check against its source ([issue 8](https://github.com/mannepanne/energy-sim/issues/8)).',
].join('\n');

/** The house with no loft insulation, the report's variant. */
export const noLoftInsulation = (house: House): House => ({ ...house, loft: 'none' });

/** The whole report, ending in a single newline. */
export function buildReport(register: Register, snapshot: PvgisSnapshot, plan: SamplingPlan = REPORT_PLAN): string {
  const access = createAccessor(register);
  const house = defaultHouse(access, REFERENCE_ARCHETYPE);
  const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access, { house }));
  const run = runPaired(access, weather, plan);
  const comparison = compare(run);
  const sections = [
    [
      '# Phase 1 report: a 1930s semi in London',
      '',
      '*Generated by `npm run report` from `data/register.json` and the PVGIS snapshot. Do not edit by hand.*',
      '',
      '*This report is regenerated on the current engine and register until the phase 2 report replaces it, so its house and numbers differ from those at the close of phase 1 (filled cavity walls by default, derived geometry and the checked RdSAP tables).*',
      '',
      'This report compares a gas combi boiler with an air source heat pump for one house, with honest ranges. The numbers are estimates for a typical house of this kind, not advice for any particular home, and not financial advice.',
    ].join('\n'),
    houseSection(access),
    resultsSection(comparison),
    comparisonSection(comparison, plan.count),
    sensitivitySection(access, sensitivity(access, weather)),
    variantSection(compare(runPaired(access, weather, plan, noLoftInsulation(house)))),
    methodSection(register, access, run),
    benchmarkSection(run.central.gas.gasKwh),
    dataDatesSection(register, snapshot),
    LIMITATIONS,
  ];
  return `${sections.join('\n\n')}\n`;
}
