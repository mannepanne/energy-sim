// ABOUT: Builds the tariff table: the 10 setup and tariff combinations' running costs and shares cheapest, what control does
// ABOUT: on Cosy and Agile, and Agile's stated limitations. Pure and clock-free, so output is byte-identical

import { compare, runSamples, type Band, type Comparison } from '../../src/engine/compare.ts';
import { COMBINATIONS, forCombination, partsOf, REFERENCE_COMBINATION, type Combination } from '../../src/engine/combinations.ts';
import type { EngineInputs } from '../../src/engine/inputs.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import { simulate } from '../../src/engine/simulate.ts';
import { agileTariff, CHEAP, cosyTariff, PEAK, type AgileRates, type ElectricityTariff, type TimeOfUseTariff } from '../../src/engine/tariffs.ts';
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

/** The heat pump's running on a time-of-use tariff, central, with control off and on. */
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
  /** The year's mean indoor temperature: control keeps the house warmer than the schedule alone. */
  meanIndoorC: number;
  costPounds: number;
}

const mean = (values: Float64Array): number => values.reduce((total, value) => total + value, 0) / values.length;

function controlledRun(inputs: EngineInputs, weather: PreparedWeather, tariff: ElectricityTariff, control: boolean): ControlledRun {
  const result = simulate(inputs, weather, 'heatPump', { tariff, control });
  const { band } = tariff;
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
    meanIndoorC: mean(result.hourly.internalTemperatureC),
    costPounds: result.annual.cost.totalPounds,
  };
}

export function controlEffects(inputs: EngineInputs, weather: PreparedWeather, agile: AgileRates): ControlEffect[] {
  const tariffs: { tariff: TimeOfUseTariff; electricity: ElectricityTariff }[] = [
    { tariff: 'cosy', electricity: cosyTariff(inputs) },
    { tariff: 'agile', electricity: agileTariff(inputs, agile) },
  ];
  return tariffs.map(({ tariff, electricity }) => ({
    tariff,
    off: controlledRun(inputs, weather, electricity, false),
    on: controlledRun(inputs, weather, electricity, true),
  }));
}

/** The mean indoor temperature with no control: the heat pump on the cap, and the gas boiler. */
export function scheduleTemperatures(inputs: EngineInputs, weather: PreparedWeather): { gasC: number; heatPumpC: number } {
  return {
    gasC: mean(simulate(inputs, weather, 'gas').hourly.internalTemperatureC),
    heatPumpC: mean(simulate(inputs, weather, 'heatPump').hourly.internalTemperatureC),
  };
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

/** What every Cosy and Agile result assumes, stated next to them as the Agile limitations are. */
export const TIME_OF_USE_ASSUMPTIONS: readonly string[] = [
  '- **Cosy and Agile results assume a smart controller** that follows the control rules. A heat pump left on its schedule costs what the “control off” rows show.',
  '- **Control keeps the house warmer.** Preheating holds it above the setpoint in cheap hours, so Cosy and Agile buy extra warmth the comparison doesn’t value; the mean indoor temperatures show how much.',
  '- **Carbon counts the extra electricity but not when it is used.** The annual grid factor can’t credit cheap hours that are often cleaner ([issue 17](https://github.com/mannepanne/energy-sim/issues/17)).',
  '- **Electricity carries no VAT from October 2026 to March 2027,** and every year of payback assumes it stays at 0% while gas carries 5%: a small tilt towards the heat pump.',
  '- **“Cheapest on its tariff”** ranks 2 combinations on Cosy and 4 on the price cap and on Agile, so the shares don’t compare between tariffs.',
];

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

const celsius = (value: number): string => `${value.toFixed(1)} °C`;

function controlLine(effect: ControlEffect): string {
  const run = (label: string, values: ControlledRun): string =>
    [
      `${TARIFF_NAMES[effect.tariff]}, control ${label}`,
      celsius(values.meanIndoorC),
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
  agile: AgileRates,
  plan: SamplingPlan = TARIFF_PLAN,
): string {
  const comparison = compare(runSamples(access, weather, plan, { combinations: COMBINATIONS, agile }));
  const effects = controlEffects(inputs, weather, agile);
  const schedules = scheduleTemperatures(inputs, weather);
  return [
    `The 1930s semi at its defaults, in London. Central, with the 10th to 90th percentile from ${wholeNumber(plan.count)} samples (seed ${plan.seed}). Gas is always on the price cap; the tariff is the electricity tariff. The difference is the gas boiler on the price cap minus the combination, so a positive difference is a saving. The heat pump follows the control rules on Cosy and Agile (REFERENCE/engine.md).`,
    '',
    '| Combination | Running cost a year | Difference | Carbon | Cheapest of all | Cheapest on its tariff |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...COMBINATIONS.map((combination) => `| ${combinationLine(comparison, combination)} |`),
    '',
    `What control does to the heat pump without solar, central. The shares are of the heat pump’s own electricity. With no control, the year’s mean indoor temperature is ${celsius(schedules.heatPumpC)} for the heat pump on its schedule and ${celsius(schedules.gasC)} for the gas boiler on its own.`,
    '',
    '| Tariff and control | Mean indoor temperature | In cheap hours | In peak hours | Space heat | Heat pump electricity | Running cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...effects.map(controlLine),
    '',
    ...TIME_OF_USE_ASSUMPTIONS,
    ...agileLimitations(agile.window),
    '',
  ].join('\n');
}
