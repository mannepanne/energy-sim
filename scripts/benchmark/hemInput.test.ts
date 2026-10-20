// ABOUT: Tests for the HEM input builder used in benchmark step 2
// ABOUT: Checks element areas and U-values match the draft archetype, and the run settings are as agreed

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { archetype, occupancy, uValues } from './draftValues.ts';
import { roughEstimate } from './roughEstimate.ts';
import {
  HEM_RUNS,
  SAP_HEATING_HOURS,
  SCHEDULED_CHECK_HEAT_CAPACITY_J_PER_K,
  SCHEDULED_HEM_RUNS,
  R_SE,
  R_SI_HORIZONTAL,
  R_SI_UPWARDS,
  buildHemInput,
  constructionResistance,
  elementArea,
  hemInputFileContents,
  thermostatSchedule,
  totalHeatCapacityJPerK,
  type HemBuildingElement,
  type HemInputOptions,
} from './hemInput.ts';

const MAIN: HemInputOptions = HEM_RUNS[0].options;

const elements = (options: HemInputOptions = MAIN) => buildHemInput(options).Zone.house.BuildingElement;

/** Looks up a building element by name, failing the test if it is missing. */
function element(name: string, options?: HemInputOptions): HemBuildingElement {
  const found = elements(options)[name];
  if (!found) throw new Error(`No building element named "${name}"`);
  return found;
}

const ofType = (type: string, options?: HemInputOptions) =>
  Object.values(elements(options)).filter((item) => item.type === type);

const areaOf = elementArea;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** U-value HEM will derive from an element's construction resistance. */
const uFromHem = (item: HemBuildingElement) => {
  const rsi = item.pitch === 0 ? R_SI_UPWARDS : R_SI_HORIZONTAL;
  return 1 / (rsi + (item.thermal_resistance_construction ?? Number.NaN) + R_SE);
};

describe('constructionResistance', () => {
  it('inverts HEM’s U = 1 / (R_si + R_c + R_se)', () => {
    const rc = constructionResistance(1.5, R_SI_HORIZONTAL);
    expect(1 / (R_SI_HORIZONTAL + rc + R_SE)).toBeCloseTo(1.5, 12);
  });
});

describe('buildHemInput', () => {
  it('gives the walls the draft net wall area in total', () => {
    const walls = Object.entries(elements()).filter(([name]) => name.startsWith('wall '));
    expect(sum(walls.map(([, wall]) => areaOf(wall)))).toBeCloseTo(archetype.netWallAreaM2.value, 9);
  });

  it('splits the draft window area equally over four orientations', () => {
    const windows = ofType('BuildingElementTransparent');
    expect(windows.map((window) => window.orientation360 ?? -1).toSorted((a, b) => a - b)).toEqual([
      0, 90, 180, 270,
    ]);
    expect(sum(windows.map(areaOf))).toBeCloseTo(archetype.windowAreaM2.value, 9);
  });

  it('reproduces the draft fabric heat loss (UA) of the rough calculation', () => {
    const opaque = ofType('BuildingElementOpaque');
    const windows = ofType('BuildingElementTransparent');
    const [ground] = ofType('BuildingElementGround');
    const fabricUa =
      sum([...opaque, ...windows].map((item) => uFromHem(item) * areaOf(item))) +
      (ground?.u_value ?? 0) * archetype.groundFloorAreaM2.value;
    expect(fabricUa).toBeCloseTo(roughEstimate(uValues.roof.value).heatLoss.fabricWPerK, 6);
  });

  it('uses the draft U-values for each element type', () => {
    expect(uFromHem(element('wall front'))).toBeCloseTo(uValues.wall.value, 12);
    expect(uFromHem(element('window 180'))).toBeCloseTo(uValues.window.value, 12);
    expect(uFromHem(element('door'))).toBeCloseTo(uValues.door.value, 12);
    expect(uFromHem(element('loft ceiling'))).toBeCloseTo(uValues.roof.value, 12);
    expect(element('ground').u_value).toBe(uValues.floor.value);
  });

  it('sets the roof U-value from the options', () => {
    const roof = element('loft ceiling', { ...MAIN, roofUValueWPerM2K: uValues.roofNoInsulation.value });
    expect(uFromHem(roof)).toBeCloseTo(uValues.roofNoInsulation.value, 12);
  });

  it('runs a full year with constant gains and a constant thermostat from the options', () => {
    const input = buildHemInput({ ...MAIN, thermostatC: 17 });
    expect(input.SimulationTime.end).toBe(8760);
    expect(input.InternalGains['metabolic gains'].schedule.main).toEqual([
      { value: occupancy.internalGainsW.value, repeat: 8760 },
    ]);
    expect(input.Control.thermostat?.schedule.main).toEqual([{ value: 17, repeat: 8760 }]);
    expect(input.Zone.house.area).toBe(archetype.totalFloorAreaM2.value);
    expect(input.Zone.house.volume).toBe(archetype.heatedVolumeM3.value);
  });
});

describe('thermostatSchedule', () => {
  it('holds one setpoint in every hour for continuous heating', () => {
    expect(thermostatSchedule('continuous', 19)).toEqual({ main: [{ value: 19, repeat: 8760 }] });
  });

  it('sets SAP’s periods: 9 hours on weekdays, 16 at weekends, and null (off) otherwise', () => {
    const schedule = thermostatSchedule('sap', 19);
    const onHours = (day: (typeof schedule)[string]) => day.flatMap((value, hour) => (value === 19 ? [hour] : []));
    expect(onHours(schedule.weekday ?? [])).toEqual(SAP_HEATING_HOURS.weekday);
    expect(onHours(schedule.weekend ?? [])).toEqual(SAP_HEATING_HOURS.weekend);
    expect(schedule.weekday?.filter((value) => value === null)).toHaveLength(15);
    expect(schedule.weekend?.filter((value) => value === null)).toHaveLength(8);
  });

  it('heats 07:00–23:00 every day for the unimodal pattern', () => {
    const schedule = thermostatSchedule('unimodal', 19);
    expect(schedule.main).toEqual([{ value: 'day', repeat: 365 }]);
    expect(schedule.day?.flatMap((value, hour) => (value === 19 ? [hour] : []))).toEqual(SAP_HEATING_HOURS.weekend);
  });

  it('opens on a Thursday, as 1 January 2026 does, and covers at least the 365 days', () => {
    const { main, week } = thermostatSchedule('sap', 19);
    expect(main.slice(0, 4)).toEqual(['weekday', 'weekday', 'weekend', 'weekend']);
    expect(week).toEqual([
      { value: 'weekday', repeat: 5 },
      { value: 'weekend', repeat: 2 },
    ]);
    expect(main[4]).toEqual({ value: 'week', repeat: 52 });
    expect(4 + 52 * 7).toBeGreaterThanOrEqual(365);
  });
});

describe('heat capacity scaling', () => {
  it('scales every element by one factor to SAP’s thermal mass parameter × floor area', () => {
    expect(SCHEDULED_CHECK_HEAT_CAPACITY_J_PER_K).toBe(250_000 * 90);
    const plain = elements();
    const scaled = elements(SCHEDULED_HEM_RUNS[0].options);
    expect(totalHeatCapacityJPerK(scaled)).toBeCloseTo(SCHEDULED_CHECK_HEAT_CAPACITY_J_PER_K, 3);
    const factor = (scaled['party wall']?.areal_heat_capacity ?? 0) / (plain['party wall']?.areal_heat_capacity ?? 1);
    expect(factor).toBeCloseTo(SCHEDULED_CHECK_HEAT_CAPACITY_J_PER_K / totalHeatCapacityJPerK(plain), 9);
    const names = Object.keys(scaled);
    expect(names.map((name) => scaled[name]?.mass_distribution_class)).toEqual(names.map((name) => plain[name]?.mass_distribution_class));
    const ratios = names
      .filter((name) => scaled[name]?.areal_heat_capacity !== undefined)
      .map((name) => (scaled[name]?.areal_heat_capacity ?? 0) / (plain[name]?.areal_heat_capacity ?? 1));
    expect(ratios).toHaveLength(7);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(factor, 9);
  });

  it('leaves the phase 1 runs at the demo input’s capacities', () => {
    expect(element('party wall').areal_heat_capacity).toBe(145_154);
  });
});

describe('SCHEDULED_HEM_RUNS', () => {
  it('starts with the decision run: SAP periods at 19 °C operative', () => {
    const [decision] = SCHEDULED_HEM_RUNS;
    expect(decision.name).toBe('schedule-sap');
    expect(decision.options).toMatchObject({ thermostatC: 19, heatingPattern: 'sap', roofUValueWPerM2K: uValues.roof.value });
    expect(buildHemInput(decision.options).Zone.house.temp_setpnt_init).toBe(19);
  });
});

describe('HEM_RUNS', () => {
  it('starts with the pre-registered main case: 100 mm loft insulation and an 18 °C thermostat', () => {
    const [main] = HEM_RUNS;
    expect(main.name).toBe('main');
    expect(main.options.roofUValueWPerM2K).toBe(uValues.roof.value);
    expect(main.options.thermostatC).toBe(occupancy.meanInternalTemperatureC.value);
  });

  it('gives every run a unique name', () => {
    const names = HEM_RUNS.map((run) => run.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('committed HEM input files', () => {
  it.each([...HEM_RUNS, ...SCHEDULED_HEM_RUNS])('$name.input.json matches the draft values', (run) => {
    const committed = readFileSync(new URL(`./hem/${run.name}.input.json`, import.meta.url), 'utf8');
    expect(committed, 'Run `npm run benchmark:hem-input`, rerun HEM and update hem/README.md').toBe(
      hemInputFileContents(run),
    );
  });

  it('keeps hourly number arrays on one line', () => {
    expect(hemInputFileContents(HEM_RUNS[0])).toMatch(/"temperatures": \[10,10,10,/);
  });
});
