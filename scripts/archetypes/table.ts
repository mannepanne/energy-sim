// ABOUT: Builds the archetype table: each archetype's central and sampled gas use and running costs, its two
// ABOUT: pre-registered NEED readings, its gap from them and the flag. Pure and clock-free, so output is byte-identical

import { ARCHETYPE_KEYS, defaultHouse, type ArchetypeKey } from '../../src/engine/archetypes.ts';
import { band, compare, runSamples, type Band } from '../../src/engine/compare.ts';
import { forCombination } from '../../src/engine/combinations.ts';
import { heatLoss } from '../../src/engine/geometry.ts';
import { readInputs } from '../../src/engine/inputs.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import type { PreparedWeather } from '../../src/engine/weather.ts';
import type { RegisterAccessor } from '../../src/register/access.ts';
import { kwh, pounds, signedPercent, wholeNumber } from '../report/format.ts';
import { archetypeGap, FLAG_THRESHOLD, needReadings, type ArchetypeGap, type NeedReadings } from './needReadings.ts';

/** The method settings for the archetype table: fewer samples than the full report, as the spec sets. */
export const ARCHETYPE_PLAN: SamplingPlan = { seed: 1, count: 200 };

export const ARCHETYPE_NAMES: Record<ArchetypeKey, string> = {
  midTerracePre1900: 'Mid-terrace, solid brick, before 1900',
  endTerracePre1900: 'End-terrace, solid brick, before 1900',
  semi1930s: 'Semi-detached, cavity, 1930–49',
  semi1950s: 'Semi-detached, cavity, 1950–66',
  bungalow1950s: 'Bungalow, cavity, 1950–66',
  midTerrace1970s: 'Mid-terrace, cavity, 1967–75',
  detached1970s: 'Detached, cavity, 1976–82',
  detached1980s: 'Detached, cavity, 1983–90',
  semi2000s: 'Semi-detached, 2007–11',
  midTerrace2010s: 'Mid-terrace, 2012–21',
};

export interface ArchetypeRow {
  archetype: ArchetypeKey;
  floorAreaM2: number;
  occupants: number;
  heatLossWPerK: number;
  gasKwh: Band;
  gasCostPounds: Band;
  heatPumpCostPounds: Band;
  readings: NeedReadings;
  gap: ArchetypeGap;
}

export function archetypeRows(access: RegisterAccessor, weather: PreparedWeather, plan: SamplingPlan = ARCHETYPE_PLAN): ArchetypeRow[] {
  return ARCHETYPE_KEYS.map((archetype) => {
    const house = defaultHouse(access, archetype);
    const run = runSamples(access, weather, plan, { house, combinations: ['gas/cap', 'heatPump/cap'] });
    const gas = forCombination(run.samples, 'gas/cap');
    const gasCentral = forCombination(run.central, 'gas/cap');
    const comparison = compare(run);
    const readings = needReadings(archetype);
    return {
      archetype,
      floorAreaM2: house.floorAreaM2,
      occupants: house.occupants,
      heatLossWPerK: heatLoss(readInputs(access, { house })).totalWPerK,
      gasKwh: band(gas.gasKwh, gasCentral.gasKwh),
      gasCostPounds: forCombination(comparison.bands, 'gas/cap').costPounds,
      heatPumpCostPounds: forCombination(comparison.bands, 'heatPump/cap').costPounds,
      readings,
      gap: archetypeGap(gasCentral.gasKwh, readings),
    };
  });
}

const banded = (value: Band, format: (value: number) => string): string => `${format(value.central)} (${format(value.p10)} to ${format(value.p90)})`;

/** The table as Markdown, ending in a single newline. */
export function archetypeTable(rows: readonly ArchetypeRow[], plan: SamplingPlan = ARCHETYPE_PLAN): string {
  const lines = rows.map((row) =>
    [
      ARCHETYPE_NAMES[row.archetype],
      `${wholeNumber(row.floorAreaM2)} m², ${row.occupants}`,
      `${wholeNumber(row.heatLossWPerK)} W/K`,
      banded(row.gasKwh, kwh),
      banded(row.gasCostPounds, pounds),
      banded(row.heatPumpCostPounds, pounds),
      kwh(row.readings.readingTKwh),
      kwh(row.readings.readingSKwh),
      row.gap.gap === 0 ? 'inside' : signedPercent(row.gap.gap, 0),
      row.gap.flagged ? '**flagged**' : '',
    ].join(' | '),
  );
  return [
    `Each archetype at its default floor area, occupants and quick-facts answers, on the price cap. Central, with the 10th to 90th percentile from ${wholeNumber(plan.count)} samples (seed ${plan.seed}). Gas is the gas boiler setup's annual gas use. The gap is how far central gas use lies outside the interval between NEED readings T and S; an archetype is flagged above ${Math.round(FLAG_THRESHOLD * 100)}% (see scripts/archetypes/README.md).`,
    '',
    '| Archetype | Floor area, occupants | H | Gas | Gas boiler cost | Heat pump cost | NEED T | NEED S | Gap | Flag |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...lines.map((line) => `| ${line} |`),
    '',
  ].join('\n');
}
