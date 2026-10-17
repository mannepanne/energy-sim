// ABOUT: Tests for the HEM input builder used in benchmark step 2
// ABOUT: Checks element areas and U-values match the draft archetype, and the run settings are as agreed

import { describe, expect, it } from 'vitest';
import { archetype, occupancy, uValues } from './draftValues.ts';
import {
  HEM_RUNS,
  R_SE,
  R_SI_HORIZONTAL,
  R_SI_UPWARDS,
  buildHemInput,
  constructionResistance,
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

const areaOf = (item: HemBuildingElement) => item.area ?? (item.width ?? 0) * (item.height ?? 0);
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
    // Same total as roughEstimate.test.ts: 227.7365 W/K for the main case
    expect(fabricUa).toBeCloseTo(227.7365, 6);
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
