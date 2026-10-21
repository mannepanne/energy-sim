// ABOUT: The phase 2 report's result tables: each metric for every combination run, the paired differences, payback,
// ABOUT: solar's own payback, the running-cost and payback sensitivity tables, and the heat pump on the gas schedule

import { centralOutsideBand, type Band, type Comparison, type Metric } from '../../src/engine/compare.ts';
import { COMBINATIONS, forCombination, partsOf, type ByCombination, type Combination } from '../../src/engine/combinations.ts';
import type { PaybackSummary } from '../../src/engine/payback.ts';
import type { PaybackSensitivity } from '../../src/engine/paybackSensitivity.ts';
import type { SensitivityTable } from '../../src/engine/sensitivity.ts';
import type { AnnualResult } from '../../src/engine/simulate.ts';
import { COMBINATION_NAMES } from '../tariffs/table.ts';
import { kwh, paybackYears, plainValue, pounds, range, share } from './format.ts';

/** The pointer every table with Cosy or Agile rows carries to the caveats stated in full next to the headline results. */
export const TIME_OF_USE_NOTE =
  'Cosy and Agile rows carry the [time-of-use caveats](#time-of-use-caveats): a smart controller, a warmer house that isn’t valued, carbon by the annual factor, 0% VAT on electricity in every payback year, and, for Agile, one past year of prices on typical weather.';

/** The combinations a record holds, in the grid's order. */
const present = (record: ByCombination<unknown>): Combination[] => COMBINATIONS.filter((combination) => record[combination] !== undefined);

const hasTimeOfUse = (combinations: readonly Combination[]): boolean => combinations.some((combination) => partsOf(combination).tariff !== 'cap');

const bandCells = (value: Band, format: (value: number) => string): string =>
  `${format(value.central)} | ${format(value.median)} | ${range(format(value.p10), format(value.p90))}`;

/** A sentence naming each band whose central run lies outside its own P10–P90 because the range is skewed. */
function outsideNote(entries: readonly { name: string; band: Band }[]): string[] {
  const outside = entries.filter((entry) => centralOutsideBand(entry.band)).map((entry) => entry.name);
  if (outside.length === 0) return [];
  return ['', `The central value lies outside the 10th to 90th percentile for ${outside.join('; ')}, because the range is skewed.`];
}

const withNote = (combinations: readonly Combination[], lines: readonly string[]): string[] =>
  hasTimeOfUse(combinations) ? [...lines, '', TIME_OF_USE_NOTE] : [...lines];

/** One metric for every combination run: central, median and P10–P90. */
export function metricTable(comparison: Comparison, metric: Metric, label: string, format: (value: number) => string): string {
  const combinations = present(comparison.bands);
  const entries = combinations.map((combination) => ({ name: COMBINATION_NAMES[combination], band: forCombination(comparison.bands, combination)[metric] }));
  return withNote(combinations, [
    `| ${label} | Central | Median | 10th to 90th percentile |`,
    '| --- | ---: | ---: | ---: |',
    ...entries.map(({ name, band }) => `| ${name} | ${bandCells(band, format)} |`),
    ...outsideNote(entries),
  ]).join('\n');
}

/** Central energy flows for every combination run, so each running cost can be traced. */
export function energyTable(comparison: Comparison): string {
  const metrics: readonly Metric[] = ['spaceHeatKwh', 'hotWaterKwh', 'gasKwh', 'electricityKwh', 'generationKwh', 'exportKwh'];
  const combinations = present(comparison.bands);
  return [
    '| Central, a year | Space heat | Hot water heat | Gas | Electricity | Solar generation | Exported |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...combinations.map((combination) => {
      const bands = forCombination(comparison.bands, combination);
      return `| ${COMBINATION_NAMES[combination]} | ${metrics.map((metric) => kwh(bands[metric].central)).join(' | ')} |`;
    }),
  ].join('\n');
}

/** The reference minus each other combination, per sample: running cost and carbon. */
export function differenceTable(comparison: Comparison, format: { cost: (value: number) => string; carbon: (value: number) => string }): string {
  const combinations = present(comparison.differences);
  const entries = combinations.flatMap((combination) => {
    const difference = forCombination(comparison.differences, combination);
    return [
      { name: `${COMBINATION_NAMES[combination]}, running cost`, band: difference.costPounds },
      { name: `${COMBINATION_NAMES[combination]}, carbon`, band: difference.carbonKg },
    ];
  });
  return withNote(combinations, [
    '| Reference minus combination, a year | Running cost, central | Median | 10th to 90th percentile | Carbon, central | Median | 10th to 90th percentile |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...combinations.map((combination) => {
      const difference = forCombination(comparison.differences, combination);
      return `| ${COMBINATION_NAMES[combination]} | ${bandCells(difference.costPounds, format.cost)} | ${bandCells(difference.carbonKg, format.carbon)} |`;
    }),
    ...outsideNote(entries),
  ]).join('\n');
}

const paybackCells = (summary: PaybackSummary): string =>
  [
    paybackYears(summary.central),
    paybackYears(summary.median),
    range(paybackYears(summary.p10), paybackYears(summary.p90)),
    share(summary.sharePaysBack),
    share(summary.shareDoesNotPayBack),
    share(summary.shareCheaperUpFrontCostsMoreToRun),
  ].join(' | ');

const PAYBACK_HEADER = 'Central | Median | 10th to 90th percentile | Pays back | Doesn’t pay back | Cheaper up front, costs more to run |';
const PAYBACK_RULE = '| --- | ---: | ---: | ---: | ---: | ---: | ---: |';

/** Payback against the reference, for every combination but the reference. */
export function paybackTable(comparison: Comparison): string {
  const combinations = present(comparison.payback);
  return withNote(combinations, [
    `| Against replacing the boiler | ${PAYBACK_HEADER}`,
    PAYBACK_RULE,
    ...combinations.map((combination) => `| ${COMBINATION_NAMES[combination]} | ${paybackCells(forCombination(comparison.payback, combination))} |`),
  ]).join('\n');
}

/** Solar against the same heating and tariff without it, over PV's lifetime. */
export function solarPaybackTable(comparison: Comparison): string {
  const combinations = present(comparison.solarPayback);
  return withNote(combinations, [
    `| Solar added to | ${PAYBACK_HEADER}`,
    PAYBACK_RULE,
    ...combinations.map(
      (combination) => `| ${COMBINATION_NAMES[combination].replace(' with solar', '')} | ${paybackCells(forCombination(comparison.solarPayback, combination))} |`,
    ),
  ]).join('\n');
}

/** A row's low and high with its unit: pounds as "£8,000", per-unit pounds as "£1,250 to £2,500 per kWp". */
export function valueRange(low: number, high: number, unit: string): string {
  if (unit.startsWith('£')) {
    const per = unit.slice(1).replace(/^\//, ' per ');
    return `${range(pounds(low), pounds(high))}${per}`;
  }
  return `${plainValue(low)} to ${plainValue(high)}${unit === 'ratio' ? '' : ` ${unit}`}`;
}

/** One running-cost sensitivity table: each row's low and high, both combinations' costs and their difference. */
export function sensitivityTable({ pair, rows }: SensitivityTable): string {
  const lines = rows.map(
    (row) =>
      `| ${row.label} | ${valueRange(row.low.value, row.high.value, row.unit)} | ${range(pounds(row.low.costPounds.against), pounds(row.high.costPounds.against))} | ${range(pounds(row.low.costPounds.option), pounds(row.high.costPounds.option))} | ${range(pounds(row.low.costDifferencePounds), pounds(row.high.costDifferencePounds))} |`,
  );
  return withNote(
    [pair.option, pair.against],
    [
      `| Row | Low to high | ${COMBINATION_NAMES[pair.against]} | ${COMBINATION_NAMES[pair.option]} | Difference |`,
      '| --- | --- | ---: | ---: | ---: |',
      ...lines,
    ],
  ).join('\n');
}

/** A pair's column heading: the option's name, or "Solar on …" for solar against no solar. */
const pairName = (pair: { option: Combination; against: Combination }): string =>
  pair.against === 'gas/cap' ? COMBINATION_NAMES[pair.option] : `Solar on the ${COMBINATION_NAMES[pair.against].charAt(0).toLowerCase()}${COMBINATION_NAMES[pair.against].slice(1)}`;

const paybackEnds = (low: number, high: number): string => range(paybackYears(low), paybackYears(high));

/** The payback sensitivity: each capital row's low and high, with each pair's central payback at both ends. */
export function paybackSensitivityTable(table: PaybackSensitivity): string {
  return withNote(
    table.pairs.flatMap((pair) => [pair.option, pair.against]),
    [
      `| Row | Low to high | ${table.pairs.map(pairName).join(' | ')} |`,
      `| --- | --- | ${table.pairs.map(() => '---:').join(' | ')} |`,
      `| Every row at its default | | ${table.central.map(paybackYears).join(' | ')} |`,
      ...table.rows.map(
        (row) => `| ${row.label} | ${valueRange(row.low.value, row.high.value, row.unit)} | ${row.low.years.map((year, index) => paybackEnds(year, row.high.years[index]!)).join(' | ')} |`,
      ),
    ],
  ).join('\n');
}

/** The heat pump combinations on their own schedule and on the gas boiler's, central, against the reference. */
export function scheduleTable(own: ByCombination<AnnualResult>, onGasSchedule: ByCombination<AnnualResult>, reference: Combination): string {
  const combinations = present(own).filter((combination) => combination !== reference);
  const referenceCost = forCombination(own, reference).cost.totalPounds;
  return withNote(combinations, [
    '| Central, a year | Space heat, own schedule | On the gas schedule | Running cost, own schedule | On the gas schedule | Reference minus it, own schedule | On the gas schedule |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...combinations.map((combination) => {
      const [mine, gas] = [forCombination(own, combination), forCombination(onGasSchedule, combination)];
      return `| ${COMBINATION_NAMES[combination]} | ${kwh(mine.spaceHeatKwh)} | ${kwh(gas.spaceHeatKwh)} | ${pounds(mine.cost.totalPounds)} | ${pounds(gas.cost.totalPounds)} | ${pounds(referenceCost - mine.cost.totalPounds)} | ${pounds(referenceCost - gas.cost.totalPounds)} |`;
    }),
  ]).join('\n');
}
