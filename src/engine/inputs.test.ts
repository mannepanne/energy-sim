// ABOUT: Tests for reading engine inputs from a register: every value comes from its row or cell
// ABOUT: Covers quick-facts answers, per-occupant terms, overrides of uncertain rows and cells, and errors

import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { defaultHouse } from './archetypes.ts';
import { readInputs, uncertainDraws, UNCERTAIN_ROW_IDS } from './inputs.ts';
import { fixtureAccessor, fixtureRegister } from './testing/fixtureRegister.ts';

describe('readInputs', () => {
  it('reads each value from its register row or cell', () => {
    const inputs = readInputs(fixtureAccessor({ 'fabric.wallUValue': 1.23, 'prices.gasUnitRate': 7.97 }));
    expect(inputs.wallUValue).toBe(1.23);
    expect(inputs.gasUnitRatePence).toBe(7.97);
    expect(inputs.meanInternalTemperatureC).toBe(20);
    expect(inputs.irradianceSampleMinute).toBe(10);
    expect(inputs.house.archetype).toBe('semi1930s');
  });

  it('picks the roof, window and g-value cells by the quick-facts answers', () => {
    const access = fixtureAccessor({ 'fabric.windowUValue': { single: 4.8, olderDouble: 2.8, newerDouble: 2 }, 'gains.windowGValue': { single: 0.85, olderDouble: 0.76, newerDouble: 0.72 } });
    const house = defaultHouse(access, 'semi1930s');
    expect(readInputs(access, { house }).roofUValue).toBe(0.5);
    expect(readInputs(access, { house: { ...house, loft: 'none' } }).roofUValue).toBe(2);
    const single = readInputs(access, { house: { ...house, glazing: 'single' } });
    expect(single.windowUValue).toBe(4.8);
    expect(single.windowGValue).toBe(0.85);
  });

  it('adds the curtain resistance to the window U-value: 1 ÷ (1/2.8 + 0.04) = 2.518', () => {
    const inputs = readInputs(fixtureAccessor({ 'fabric.windowUValue': 2.8, 'fabric.windowCurtainResistance': 0.04 }));
    expect(inputs.windowUValue).toBeCloseTo(1 / (1 / 2.8 + 0.04), 12);
    expect(inputs.windowUValue).toBeCloseTo(2.518, 3);
  });

  it('builds internal gains and hot water from a fixed part plus the occupants × a per-occupant term', () => {
    const access = fixtureAccessor({ 'gains.perFloorArea': 0.5 });
    const house = { ...defaultHouse(access, 'semi1930s'), occupants: 2 };
    const inputs = readInputs(access, { house });
    expect(inputs.internalGainsW).toBe(0.5 * 100 + 2 * 100);
    expect(inputs.hotWaterLitresPerDay).toBe(20 + 2 * 20);
  });

  it('takes defaults for uncertain rows, and overrides when given (the central run uses only defaults)', () => {
    const access = fixtureAccessor();
    expect(readInputs(access).heatPumpSpf).toBe(2.5);
    const overridden = readInputs(access, { overrides: { 'heating.heatPumpSpf': 3.2 } });
    expect(overridden.heatPumpSpf).toBe(3.2);
    expect({ ...overridden, heatPumpSpf: 2.5 }).toEqual(readInputs(access));
  });

  it('reads an uncertain table cell at its default, and overrides it under "rowId|key"', () => {
    const rows = fixtureRegister().rows.map((row) =>
      row.kind === 'table' && row.id === 'fabric.airChangeRate'
        ? { ...row, cells: row.cells.map((cell) => (cell.key === 'C' ? { key: 'C', default: 0.8, low: 0.6, high: 1.2, distribution: 'triangular' as const } : cell)) }
        : row,
    );
    const access = createAccessor(loadRegister({ rows }));
    expect(readInputs(access).airChangesPerHour).toBe(0.8);
    expect(readInputs(access, { overrides: { 'fabric.airChangeRate|C': 1.1 } }).airChangesPerHour).toBe(1.1);
    const draw = uncertainDraws(access).find((candidate) => candidate.id === 'fabric.airChangeRate|C');
    expect(draw).toMatchObject({ low: 0.6, high: 1.2, label: 'Fixture fabric.airChangeRate (C)', unit: 'fixture' });
  });

  it('lists every uncertain row the house reads, in reading order', () => {
    expect(uncertainDraws(fixtureAccessor()).map((draw) => draw.id).toSorted()).toEqual([...UNCERTAIN_ROW_IDS].toSorted());
  });

  it('rejects an override that is not a finite number, or that names a value the house does not read', () => {
    expect(() => readInputs(fixtureAccessor(), { overrides: { 'heating.heatPumpSpf': Number.NaN } })).toThrow(
      'Override for "heating.heatPumpSpf" must be a finite number',
    );
    expect(() => readInputs(fixtureAccessor(), { overrides: { 'gains.perOccupant': Infinity } })).toThrow('finite');
    expect(() => readInputs(fixtureAccessor(), { overrides: { 'fabric.airChangeRate|C': 1 } })).toThrow(
      'Override for "fabric.airChangeRate|C" names no uncertain value this house reads',
    );
  });

  it('reads uncertain rows as uncertain, so a register with the wrong kind fails naming the row', () => {
    const rows = fixtureRegister().rows.map((row) => {
      if (row.kind !== 'uncertain' || row.id !== 'heating.heatPumpSpf') return row;
      const { default: value, low: _low, high: _high, distribution: _distribution, ...base } = row;
      return { ...base, kind: 'fixed', value };
    });
    expect(() => readInputs(createAccessor(loadRegister({ rows })))).toThrow(
      'Register row "heating.heatPumpSpf" has kind "fixed", not "uncertain"',
    );
  });

  it('throws an error naming a row or a cell the register lacks', () => {
    const rows = fixtureRegister().rows.filter((row) => row.id !== 'gains.groundReflectance');
    expect(() => readInputs(createAccessor(loadRegister({ rows })))).toThrow('"gains.groundReflectance"');
    const noBandC = fixtureRegister().rows.map((row) =>
      row.kind === 'table' && row.id === 'fabric.doorUValue' ? { ...row, cells: row.cells.filter((cell) => cell.key !== 'C') } : row,
    );
    expect(() => readInputs(createAccessor(loadRegister({ rows: noBandC })))).toThrow('Register row "fabric.doorUValue" has no cell with key "C"');
  });
});
