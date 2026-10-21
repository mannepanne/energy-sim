// ABOUT: Builds the tariff table: the 10 setup and tariff combinations' running costs and shares cheapest, what control does
// ABOUT: on Cosy and Agile, and Agile's stated limitations. Pure and clock-free, so output is byte-identical

import { compare, runSetups, type Band, type Comparison } from '../../src/engine/compare.ts';
import { COMBINATIONS, forCombination, partsOf, REFERENCE_COMBINATION, type Combination } from '../../src/engine/combinations.ts';
import type { EngineInputs } from '../../src/engine/inputs.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import { simulate } from '../../src/engine/simulate.ts';
import { CHEAP, PEAK, type TimeOfUseTariff, type TimeOfUseTariffs } from '../../src/engine/tariffs.ts';
import type { PreparedWeather } from '../../src/engine/weather.ts';
import type { RegisterAccessor } from '../../src/register/access.ts';
import { kgCo2e, kwh, pounds, share, wholeNumber } from '../report/format.ts';

/** The table's method settings: the archetype table's sample count, enough for a first look before the report. */
export const TARIFF_PLAN: SamplingPlan = { seed: 1, count: 200 };

export const COMBINATION_NAMES: Record<Combination, string> = {
  'gas/cap': 'Gas boiler, price cap',
  'gas/agile': 'Gas boiler, Agile',
  'gasSolar/cap': 'Gas boiler with solar, price cap',
  'gasSolar/agile': 'Gas boiler with solar, Agile',
  'heatPump/cap': 'Heat pump, price cap',
  'heatPump/cosy': 'Heat pump, Cosy',
  'heatPump/agile': 'Heat pump, Agile',
  'heatPumpSolar/cap': 'Heat pump with solar, price cap',
  'heatPumpSolar/cosy': 'Heat pump with solar, Cosy',
  'heatPumpSolar/agile': 'Heat pump with solar, Agile',
};

const TARIFF_NAMES: Record<TimeOfUseTariff, string> = { cosy: 'Cosy', agile: 'Agile' };

/** The heat pump's electricity on a time-of-use tariff, central, with control off and on. */
export interface ControlEffect {
  tariff: TimeOfUseTariff;
  off: ControlledRun;
  on: ControlledRun;
}

export interface ControlledRun {
  /** Shares of the heat pump's own electricity (space heating, cylinder and standby) in cheap and in peak hours. */
  cheapShare: number;
  peakShare: number;
  heatPumpElectricityKwh: number;
  spaceHeatKwh: number;
  costPounds: number;
}

function controlledRun(inputs: EngineInputs, weather: PreparedWeather, timeOfUse: TimeOfUseTariffs, tariff: TimeOfUseTariff, control: boolean): ControlledRun {
  const result = simulate(inputs, weather, 'heatPump', { tariff: timeOfUse[tariff], control });
  const { band } = timeOfUse[tariff];
  const electricity = result.hourly.heatingElectricityKwh;
  let cheap = 0;
  let peak = 0;
  for (let hour = 0; hour < electricity.length; hour += 1) {
    if (band[hour] === CHEAP) cheap += electricity[hour]!;
    if (band[hour] === PEAK) peak += electricity[hour]!;
  }
  const total = result.annual.heatingElectricityKwh;
  return {
    cheapShare: cheap / total,
    peakShare: peak / total,
    heatPumpElectricityKwh: total,
    spaceHeatKwh: result.annual.spaceHeatKwh,
    costPounds: result.annual.cost.totalPounds,
  };
}

export function controlEffects(inputs: EngineInputs, weather: PreparedWeather, timeOfUse: TimeOfUseTariffs): ControlEffect[] {
  return (['cosy', 'agile'] as const).map((tariff) => ({
    tariff,
    off: controlledRun(inputs, weather, timeOfUse, tariff, false),
    on: controlledRun(inputs, weather, timeOfUse, tariff, true),
  }));
}

/** The month and year of a UTC instant, such as "October 2025". */
const monthYear = (instant: string): string =>
  new Date(instant).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The four limitations the spec requires wherever Agile results appear, with the window the rates come from. */
export function agileLimitations(window: { start: string; end: string }): string[] {
  const lastMonth = new Date(Date.parse(window.end) - 1).toISOString();
  return [
    `- **Agile is one past year:** its half-hourly London rates from ${monthYear(window.start)} to ${monthYear(lastMonth)}, placed on the typical year by calendar date and time. A past year is not a forecast.`,
    '- **Past prices on typical weather:** the year’s prices are paired with the typical year’s weather, which loses the link between price spikes and cold, still days. This likely flatters the heat pump on Agile.',
    '- **Control knows each day’s prices in advance.** Octopus publishes them the day before, so this is realistic for a smart controller, but it favours the heat pump over a household that doesn’t respond.',
    '- **Weekdays don’t match** between the past year and the reference year the schedules use.',
  ];
}

const banded = (value: Band, format: (value: number) => string): string => `${format(value.central)} (${format(value.p10)} to ${format(value.p90)})`;

function combinationLine(comparison: Comparison, combination: Combination): string {
  const bands = forCombination(comparison.bands, combination);
  const { tariff } = partsOf(combination);
  const difference = combination === REFERENCE_COMBINATION ? 'reference' : pounds(forCombination(comparison.differences, combination).costPounds.central);
  const withinTariff = forCombination(comparison.shareCheapestByTariff[tariff]!, combination);
  return [
    COMBINATION_NAMES[combination],
    banded(bands.costPounds, pounds),
    difference,
    banded(bands.carbonKg, kgCo2e),
    share(forCombination(comparison.shareCheapest, combination)),
    share(withinTariff),
  ].join(' | ');
}

function controlLine(effect: ControlEffect): string {
  const run = (label: string, values: ControlledRun): string =>
    [
      `${TARIFF_NAMES[effect.tariff]}, control ${label}`,
      share(values.cheapShare),
      share(values.peakShare),
      kwh(values.spaceHeatKwh),
      kwh(values.heatPumpElectricityKwh),
      pounds(values.costPounds),
    ].join(' | ');
  return [`| ${run('off', effect.off)} |`, `| ${run('on', effect.on)} |`].join('\n');
}

/** Runs the 10 combinations and the control comparison. */
export function tariffTable(
  access: RegisterAccessor,
  inputs: EngineInputs,
  weather: PreparedWeather,
  timeOfUse: TimeOfUseTariffs,
  plan: SamplingPlan = TARIFF_PLAN,
): string {
  const comparison = compare(runSetups(access, weather, plan, { combinations: COMBINATIONS, timeOfUse }));
  const effects = controlEffects(inputs, weather, timeOfUse);
  return [
    `The 1930s semi at its defaults, in London. Central, with the 10th to 90th percentile from ${wholeNumber(plan.count)} samples (seed ${plan.seed}). Gas is always on the price cap; the tariff is the electricity tariff. The difference is the gas boiler on the price cap minus the combination, so a positive difference is a saving. The heat pump follows the control rules on Cosy and Agile (REFERENCE/engine.md).`,
    '',
    '| Combination | Running cost a year | Difference | Carbon | Cheapest of all | Cheapest on its tariff |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...COMBINATIONS.map((combination) => `| ${combinationLine(comparison, combination)} |`),
    '',
    'What control does to the heat pump without solar, central. The shares are of the heat pump’s own electricity.',
    '',
    '| Tariff and control | In cheap hours | In peak hours | Space heat | Heat pump electricity | Running cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...effects.map(controlLine),
    '',
    ...agileLimitations(timeOfUse.agileWindow),
    '',
  ].join('\n');
}
