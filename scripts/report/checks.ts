// ABOUT: The phase 2 report's checks against outside references: HEM heated continuously and on schedules, and PVGIS's PV calculator
// ABOUT: The engine's side of each is computed afresh; HEM's side is the recorded result of the committed input files

import { readInputs } from '../../src/engine/inputs.ts';
import { SCHEDULED_CHECK_AIR_C, type HemCheckEngine, type HemPattern } from '../../src/engine/testing/hemCheck.ts';
import { prepareWeather, type Weather } from '../../src/engine/weather.ts';
import type { RegisterAccessor } from '../../src/register/access.ts';
import { HEM_RESULTS, SCHEDULED_HEM_RESULTS } from '../benchmark/comparison.ts';
import { gapFromReference } from '../benchmark/needReference.ts';
import { pvCheck, PV_CHECK_TOLERANCE, REFERENCE_SYSTEM } from '../pvgis/pvcalcCheck.ts';
import type { PvcalcSnapshot } from '../pvgis/pvcalc.ts';
import { celsius, kwh, signedPercent, wholeNumber } from './format.ts';

/** The pre-registered bands for every HEM check: proceed within 15%, the two-node fallback to 30%, stop above. */
const PROCEED_WITHIN = 0.15;

const SCHEDULED_ROWS: readonly { run: keyof typeof SCHEDULED_HEM_RESULTS; pattern: HemPattern; what: string }[] = [
  { run: 'schedule-sap', pattern: 'sap', what: 'The decision run: SAP’s periods (weekdays 7–9 am and 4–11 pm, weekends 7 am to 11 pm)' },
  { run: 'schedule-unimodal', pattern: 'unimodal', what: 'The heat pump’s schedule: 7 am to 11 pm every day' },
  { run: 'continuous-sap-mass', pattern: 'continuous', what: 'A diagnostic: every hour, the same thermal mass' },
];

/** The engine's gap from HEM on each scheduled run, and the bias between the gas and heat pump schedules. */
export interface ScheduledGap {
  run: keyof typeof SCHEDULED_HEM_RESULTS;
  engineKwh: number;
  /** Engine ÷ HEM − 1. */
  gap: number;
}

export function scheduledGaps(check: HemCheckEngine): ScheduledGap[] {
  return SCHEDULED_ROWS.map(({ run, pattern }) => {
    const engineKwh = check.scheduledKwh(pattern);
    return { run, engineKwh, gap: gapFromReference(engineKwh, SCHEDULED_HEM_RESULTS[run].spaceHeatKwh) };
  });
}

/** The HEM check section, from the engine's scheduled gaps and its continuous run with no mass. */
export function hemSection(gaps: readonly ScheduledGap[], continuousKwh: number): string {
  const continuousHem = HEM_RESULTS['thermostat-17']!;
  const continuousGap = gapFromReference(continuousKwh, continuousHem.spaceHeatKwh);
  const gapOf = (run: keyof typeof SCHEDULED_HEM_RESULTS): number => gaps.find((entry) => entry.run === run)!.gap;
  const bias = gapOf('schedule-unimodal') - gapOf('schedule-sap');
  return [
    '### The Home Energy Model (HEM)',
    '',
    `Each check compares annual **space heat** for the benchmark 1930s semi, described the same way on both sides, on the PVGIS typical year. The rules were committed before HEM ran: within ${Math.round(PROCEED_WITHIN * 100)}%, proceed; 15–30%, build a two-node model; above 30%, stop and review. The engine’s tests guard each figure within 10%. See [the HEM runs](../scripts/benchmark/hem/README.md).`,
    '',
    '| Check | HEM | HEM air temperature when heating | Engine | Engine ÷ HEM − 1 |',
    '| --- | ---: | ---: | ---: | ---: |',
    `| Heated in every hour, no thermal mass (phase 1, about 17.8 °C air) | ${kwh(continuousHem.spaceHeatKwh)} | ${celsius(continuousHem.meanAirTemperatureWhenHeatingC)} | ${kwh(continuousKwh)} | ${signedPercent(continuousGap, 1)} |`,
    ...SCHEDULED_ROWS.map(({ run, what }) => {
      const hem = SCHEDULED_HEM_RESULTS[run];
      const entry = gaps.find((candidate) => candidate.run === run)!;
      return `| ${what}, ${celsius(SCHEDULED_CHECK_AIR_C)} air | ${kwh(hem.spaceHeatKwh)} | ${celsius(hem.meanAirTemperatureWhenHeatingC)} | ${kwh(entry.engineKwh)} | ${signedPercent(entry.gap, 1)} |`;
    }),
    '',
    `- **Decision:** on SAP’s periods the engine is ${signedPercent(gapOf('schedule-sap'), 1)} from HEM, inside ${Math.round(PROCEED_WITHIN * 100)}%, so the one thermal-mass node proceeds. On the heat pump’s day it is ${signedPercent(gapOf('schedule-unimodal'), 1)}, also inside, so the heat pump may use that schedule.`,
    `- **The bias:** the difference between those two gaps is ${signedPercent(bias, 1).replace('%', ' points')}. On the two schedules the engine understates the heat pump’s space heat against the boiler’s by about that much, which favours the heat pump ([issue 15](https://github.com/mannepanne/energy-sim/issues/15)).`,
    '- **The diagnostic** shows the one node’s error depends on the heating pattern: it stores daytime surplus more readily than HEM’s elements, so it falls below HEM when heated in every hour.',
  ].join('\n');
}

export function pvSection(access: RegisterAccessor, weather: Weather, snapshot: PvcalcSnapshot): string {
  const inputs = readInputs(access);
  const result = pvCheck(inputs, prepareWeather(weather, inputs), snapshot);
  return [
    '### PVGIS’s PV calculator',
    '',
    `The reference system, fixed before PVcalc was called: ${REFERENCE_SYSTEM.peakPowerKw} kWp in London, tilted ${REFERENCE_SYSTEM.tiltDeg}° and facing south, with ${REFERENCE_SYSTEM.lossPercent}% system losses. PVcalc averages ${snapshot.system.years[0]}–${snapshot.system.years[1]} and models the sky, module temperature and reflection in more detail than the engine, so the pre-registered tolerance is ${Math.round(PV_CHECK_TOLERANCE * 100)}%.`,
    '',
    '| | Engine (typical year) | PVcalc |',
    '| --- | ---: | ---: |',
    `| Annual yield | ${wholeNumber(result.engineKwh)} kWh | ${wholeNumber(result.pvcalcKwh)} kWh |`,
    `| Irradiation on the panel | ${wholeNumber(result.engineInPlaneKwhPerM2)} kWh/m² | ${wholeNumber(result.pvcalcInPlaneKwhPerM2)} kWh/m² |`,
    '',
    `The engine is ${signedPercent(result.gap, 1)} from PVcalc: ${result.withinTolerance ? 'inside' : '**outside**'} the ${Math.round(PV_CHECK_TOLERANCE * 100)}% tolerance. See [scripts/pvgis/](../scripts/pvgis/) and [engine.md](../REFERENCE/engine.md#checks-against-outside-references).`,
  ].join('\n');
}
