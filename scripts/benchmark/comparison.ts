// ABOUT: Benchmark steps 2 and 3 results: recorded HEM outputs and the comparison tables for the README
// ABOUT: A test checks the README shows these tables, so a draft-value change can't leave them stale

import { archetype } from './draftValues.ts';
import { HEM_RUNS, type HemRun } from './hemInput.ts';
import { conversion, gapFromReference, needReferences, spaceHeatFromGasKwh } from './needReference.ts';
import { roughEstimate } from './roughEstimate.ts';

export interface HemResult {
  /** "Space heat demand" in HEM's results summary × the 90 m² floor area. */
  spaceHeatKwh: number;
  /** Mean zone air temperature over the hours when heating runs. */
  meanAirTemperatureWhenHeatingC: number;
}

/**
 * HEM outputs for each run, recorded from runs of the committed input files on 17 October 2026
 * (HEM commit and weather file as in hem/README.md). Rerun HEM and update these if an input changes.
 */
export const HEM_RESULTS: Record<string, HemResult> = {
  main: { spaceHeatKwh: 15_455, meanAirTemperatureWhenHeatingC: 18.8 },
  'no-loft-insulation': { spaceHeatKwh: 21_441, meanAirTemperatureWhenHeatingC: 18.95 },
  'thermostat-17': { spaceHeatKwh: 13_660, meanAirTemperatureWhenHeatingC: 17.79 },
  'thermostat-16': { spaceHeatKwh: 11_971, meanAirTemperatureWhenHeatingC: 16.78 },
};

export function hemResult(run: HemRun): HemResult {
  const result = HEM_RESULTS[run.name];
  if (!result) throw new Error(`No recorded HEM result for run "${run.name}"`);
  return result;
}

const kwh = (value: number): string => `${Math.round(value).toLocaleString('en-GB')} kWh`;
const hundreds = (value: number): string => kwh(Math.round(value / 100) * 100);
const percent = (fraction: number, places: number): string => {
  const rounded = Number((fraction * 100).toFixed(places));
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(places)}%`;
};

/** The step 2 table: each HEM run against the rough calculation for the same roof. */
export function hemComparisonMarkdown(): string {
  const rows = HEM_RUNS.map((run) => {
    const hem = hemResult(run).spaceHeatKwh;
    const rough = roughEstimate(run.options.roofUValueWPerM2K).annualSpaceHeatKwh;
    const bold = (cell: string) => (run.name === 'main' ? `**${cell}**` : cell);
    const [roughCell, gapCell] = run.comparableWithRough
      ? [kwh(rough), bold(percent(gapFromReference(rough, hem), 1))]
      : ['', ''];
    return `| \`${run.name}\` | ${bold(run.description)} | ${hemAirCell(run)} | ${bold(kwh(hem))} | ${roughCell} | ${gapCell} |`;
  });
  return [
    '| Run | What it is | HEM air temperature when heating | HEM space heat | Rough calculation (18 °C air) | Rough vs HEM |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n');
}

function hemAirCell(run: HemRun): string {
  return `${hemResult(run).meanAirTemperatureWhenHeatingC.toFixed(2)} °C`;
}

/** The step 3 table: the three NEED readings, converted to space heat, against the rough calculation. */
export function needComparisonMarkdown(): string {
  const rough = roughEstimate(HEM_RUNS[0].options.roofUValueWPerM2K).annualSpaceHeatKwh;
  const efficiencies = [conversion.boilerSeasonalEfficiency.value, conversion.boilerSeasonalEfficiencyHigh.value];
  const rows = needReferences(archetype.totalFloorAreaM2.value).map((reference) => {
    const spaceHeat = efficiencies.map((efficiency) =>
      spaceHeatFromGasKwh(reference.gasKwh, efficiency, conversion.hotWaterHeatKwh.value),
    );
    const gaps = spaceHeat.map((value) => percent(gapFromReference(rough, value), 0)).join(', ');
    return `| ${reference.name} | ${kwh(reference.gasKwh)} | ${spaceHeat.map(hundreds).join(' | ')} | ${gaps} |`;
  });
  const [low, high] = efficiencies.map((efficiency) => `${Math.round(efficiency * 100)}% boiler`);
  return [
    `| Reading | Gas a year | Space heat (${low}) | Space heat (${high}) | Rough calculation vs reference |`,
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n');
}

/** Both tables, in README order; printed by `npm run benchmark:tables`. */
export function comparisonMarkdown(): string {
  return `${hemComparisonMarkdown()}\n\n${needComparisonMarkdown()}`;
}
