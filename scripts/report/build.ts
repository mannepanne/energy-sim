// ABOUT: Builds the phase 1 report (reports/phase-1-london-semi.md) from the register and the PVGIS snapshot
// ABOUT: Pure and clock-free: the same inputs always give byte-identical Markdown

import { compare, centralOutsideBand, runPaired, type Band, type Comparison, type Metric, type PairedRun } from '../../src/engine/compare.ts';
import { heatLoss } from '../../src/engine/geometry.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import { sensitivity, type SensitivityRow } from '../../src/engine/sensitivity.ts';
import type { Setup } from '../../src/engine/simulate.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { createAccessor, type RegisterAccessor } from '../../src/register/access.ts';
import { dueDate } from '../../src/register/load.ts';
import { STATUSES, type Register } from '../../src/register/schema.ts';
import type { PvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { HEM_RESULTS } from '../benchmark/comparison.ts';
import { NEED_GAS_RANGE_KWH, NEED_GAS_TARGET_KWH } from '../calibration/meanInternalTemperature.ts';
import { exactNumber, kgCo2e, kwh, plainValue, pounds, share, wholeNumber } from './format.ts';

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

const range = (low: string, high: string): string => (low === high ? low : `${low} to ${high}`);

const bandCells = (value: Band, format: (value: number) => string): string =>
  `${format(value.central)} | ${format(value.median)} | ${range(format(value.p10), format(value.p90))}`;

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
    `**The heat pump is cheaper to run in ${share(comparison.shareHeatPumpCheaper)} of samples** (rounded to the nearest 5%; an exact tie counts as half). With ${wholeNumber(count)} samples, this share is uncertain by about ±${marginPoints(comparison.shareHeatPumpCheaper, count)} percentage points (95% confidence).`,
    '',
    '**This running-cost comparison leans in the heat pump’s favour.** One calibrated mean internal temperature, taken from gas-heated homes, applies to both setups. Heat pump households often heat for longer, so the heat pump’s running cost is likely too low here, and the share of samples in which it is cheaper too high ([issue 15](https://github.com/mannepanne/energy-sim/issues/15)). Phase 2 is where this gets addressed.',
    ...(notes.length > 0 ? ['', ...notes] : []),
  ].join('\n');
}

function sensitivitySection(rows: readonly SensitivityRow[]): string {
  const lines = rows.map((row) => {
    const unit = row.unit === 'ratio' ? '' : ` ${row.unit}`;
    const values = `${plainValue(row.low.value)} to ${plainValue(row.high.value)}${unit}`;
    return `| ${row.label} | ${values} | ${range(pounds(row.low.costPounds.gas), pounds(row.high.costPounds.gas))} | ${range(pounds(row.low.costPounds.heatPump), pounds(row.high.costPounds.heatPump))} | ${range(pounds(row.low.costDifferencePounds), pounds(row.high.costDifferencePounds))} |`;
  });
  return [
    '## Sensitivity',
    '',
    'Each uncertain row is run at its low and then its high value, with every other row at its default. The rows are ranked by how much they move the cost difference. A row that moves both setups equally, such as base electricity use, changes both running costs but not the difference.',
    '',
    'The low and high are the ends of each row’s range, not percentiles. For the heat pump SPF, they are the clip limits of its lognormal distribution (about its 1st and 99th percentiles), so its row shows an extreme spread.',
    '',
    '| Row | Low to high | Gas boiler cost | Heat pump cost | Gas minus heat pump |',
    '| --- | --- | ---: | ---: | ---: |',
    ...lines,
  ].join('\n');
}

function houseSection(access: RegisterAccessor): string {
  const inputs = readInputs(access);
  const fixed = (id: Parameters<RegisterAccessor['fixed']>[0]): number => access.fixed(id).value;
  return [
    '## The house',
    '',
    `A semi-detached house built 1930–49, in London: ${plainValue(fixed('geometry.totalFloorArea'))} m² over two storeys, unfilled cavity walls, 100 mm of loft insulation and retrofitted double glazing. This is the main case; the variant with no loft insulation is not reported here.`,
    '',
    `- Heat loss coefficient (central): ${wholeNumber(heatLoss(inputs).totalWPerK)} W/K.`,
    `- Mean internal air temperature (central): ${plainValue(inputs.meanInternalTemperatureC)} °C, held continuously.`,
    `- Prices: the Ofgem price cap, GB average by Direct Debit, 1 October to 31 December 2026. Electricity ${inputs.electricityUnitRatePence}p a kWh and ${inputs.electricityStandingChargePencePerDay}p a day; gas ${inputs.gasUnitRatePence}p a kWh and ${inputs.gasStandingChargePencePerDay}p a day. The heat pump house has no gas supply, so it pays no gas standing charge.`,
    `- Carbon: ${inputs.gasCarbonKgPerKwh} kgCO₂e a kWh of gas and ${inputs.gridCarbonKgPerKwh} kgCO₂e a kWh of grid electricity (annual average).`,
  ].join('\n');
}

function methodSection(register: Register, run: PairedRun): string {
  const uncertain = register.rows.filter((row) => row.kind === 'uncertain').map((row) => row.label.split(' (')[0]!.toLowerCase());
  return [
    '## How the ranges are made',
    '',
    `- **Samples:** ${wholeNumber(run.plan.count)} joint samples with seed ${run.plan.seed}. Each sample draws a value for every uncertain row: ${uncertain.join('; ')}. Every other number is fixed.`,
    '- **Stable draws:** each value comes from a hash of the seed, the sample number and the row id, passed through the row’s inverse distribution function. Triangular rows use their default as the mode. The SPF is lognormal and clipped to its low and high.',
    '- **Central** is the run with every row at its default. **Median** and the **10th to 90th percentile** come from the samples (linear interpolation between ranked samples).',
    '- **Fabric quality** is one shared factor on every U-value and the air change rate. The other rows are drawn independently of each other.',
    '- **Rounding:** costs to £10, energy to 100 kWh, carbon to 10 kg and shares to 5%.',
  ].join('\n');
}

function benchmarkSection(centralGasKwh: number): string {
  const hemMain = HEM_RESULTS.main!.spaceHeatKwh;
  const hem17 = HEM_RESULTS['thermostat-17']!.spaceHeatKwh;
  return [
    '## Benchmark and calibration',
    '',
    `- **Against HEM:** the government’s Home Energy Model gives ${wholeNumber(hemMain)} kWh of space heat for this house at its own settings, and ${wholeNumber(hem17)} kWh with its thermostat at 17 °C (about 17.8 °C of air). The engine, run on the same house at 17.8 °C of air, must stay within 10% of the second figure; a test enforces this. The decision rule set in advance was to proceed within 15%.`,
    `- **Against measured gas use:** comparable homes use ${wholeNumber(NEED_GAS_RANGE_KWH.low)} to ${wholeNumber(NEED_GAS_RANGE_KWH.high)} kWh of gas a year (NEED). The mean internal temperature is calibrated so the central gas use hits the midpoint, ${wholeNumber(NEED_GAS_TARGET_KWH)} kWh. Here it is ${kwh(centralGasKwh)}.`,
    '- The full write-up is in [scripts/benchmark/README.md](../scripts/benchmark/README.md) and the [calibration ADR](../REFERENCE/decisions/2026-10-17-air-temperature-calibrated-to-need.md).',
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
    `- **Register:** ${register.rows.length} rows (${statusCounts}), last checked between ${checked[0]} and ${checked[checked.length - 1]}.`,
    `- **Weather:** the PVGIS typical year for ${exactNumber(snapshot.location.latitude)}, ${exactNumber(snapshot.location.longitude)} (${snapshot.radiationDatabase}), fetched on ${snapshot.fetchedOn}. ${snapshot.attribution}`,
    '- **Rows due for a fresh check** (the rest are static):',
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
  '- **One SPF for the whole year.** The heat pump has no capacity limit and no backup heater; its performance in cold weather is phase 2 work.',
  '- **Fixed prices and one typical weather year** ([issue 16](https://github.com/mannepanne/energy-sim/issues/16)), and an **annual average grid carbon factor** ([issue 17](https://github.com/mannepanne/energy-sim/issues/17)).',
  '- **The boiler’s own pump and fan electricity is left out** ([issue 18](https://github.com/mannepanne/energy-sim/issues/18)).',
  '- **Uncertain rows other than fabric quality are drawn independently**, so a real link between them (for example, more occupants means more hot water and more internal gains) is not captured ([issue 20](https://github.com/mannepanne/energy-sim/issues/20)).',
  '- **Constant internal gains**, and windows split equally over four orientations.',
  '- Several register rows still need a line-by-line check against their source ([issues 7, 8 and 9](https://github.com/mannepanne/energy-sim/issues?q=is%3Aissue+label%3Atechnical-debt)).',
].join('\n');

/** The whole report, ending in a single newline. */
export function buildReport(register: Register, snapshot: PvgisSnapshot, plan: SamplingPlan = REPORT_PLAN): string {
  const access = createAccessor(register);
  const weather = prepareWeather(weatherFromSnapshot(snapshot), readInputs(access));
  const run = runPaired(access, weather, plan);
  const comparison = compare(run);
  const sections = [
    [
      '# Phase 1 report: a 1930s semi in London',
      '',
      '*Generated by `npm run report` from `data/register.json` and the PVGIS snapshot. Do not edit by hand.*',
      '',
      'This report compares a gas combi boiler with an air source heat pump for one house, with honest ranges. The numbers are estimates for a typical house of this kind, not advice for any particular home, and not financial advice.',
    ].join('\n'),
    houseSection(access),
    ['## Results for each setup', '', ...(['gas', 'heatPump'] as const).flatMap((setup) => [`### ${SETUP_NAMES[setup]}`, '', resultsTable(comparison, setup), ''])]
      .join('\n')
      .trimEnd(),
    comparisonSection(comparison, plan.count),
    sensitivitySection(sensitivity(access, weather)),
    methodSection(register, run),
    benchmarkSection(run.central.gas.gasKwh),
    dataDatesSection(register, snapshot),
    LIMITATIONS,
  ];
  return `${sections.join('\n\n')}\n`;
}
