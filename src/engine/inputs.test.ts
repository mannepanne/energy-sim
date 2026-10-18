// ABOUT: Tests for reading engine inputs from a register: every value comes from its row
// ABOUT: Covers the loft variant, overrides of uncertain rows, and errors for missing or fixed ids

import { describe, expect, it } from 'vitest';
import { createAccessor } from '../register/access.ts';
import { loadRegister } from '../register/load.ts';
import { readInputs } from './inputs.ts';
import { fixtureAccessor, fixtureRegister } from './testing/fixtureRegister.ts';

describe('readInputs', () => {
  it('reads each value from its register row', () => {
    const inputs = readInputs(fixtureAccessor({ 'fabric.wallUValue': 1.23, 'prices.gasUnitRate': 7.97 }));
    expect(inputs.wallUValue).toBe(1.23);
    expect(inputs.gasUnitRatePence).toBe(7.97);
    expect(inputs.meanInternalTemperatureC).toBe(20);
    expect(inputs.irradianceSampleMinute).toBe(10);
  });

  it('uses the main roof U-value unless the no-loft-insulation variant is asked for', () => {
    const access = fixtureAccessor({ 'fabric.roofUValue': 0.4, 'fabric.roofUValueNoLoftInsulation': 2.3 });
    expect(readInputs(access).roofUValue).toBe(0.4);
    expect(readInputs(access, { variant: 'noLoftInsulation' }).roofUValue).toBe(2.3);
  });

  it('takes defaults for uncertain rows, and overrides when given (the central run uses only defaults)', () => {
    const access = fixtureAccessor();
    expect(readInputs(access).heatPumpSpf).toBe(2.5);
    const overridden = readInputs(access, { overrides: { 'heating.heatPumpSpf': 3.2 } });
    expect(overridden.heatPumpSpf).toBe(3.2);
    expect({ ...overridden, heatPumpSpf: 2.5 }).toEqual(readInputs(access));
  });

  it('rejects an override that is not a finite number', () => {
    expect(() => readInputs(fixtureAccessor(), { overrides: { 'heating.heatPumpSpf': Number.NaN } })).toThrow(
      'Override for "heating.heatPumpSpf" must be a finite number',
    );
    expect(() => readInputs(fixtureAccessor(), { overrides: { 'gains.internalGains': Infinity } })).toThrow('finite');
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

  it('throws an error naming a row the register lacks', () => {
    const rows = fixtureRegister().rows.filter((row) => row.id !== 'gains.groundReflectance');
    expect(() => readInputs(createAccessor(loadRegister({ rows })))).toThrow('"gains.groundReflectance"');
  });
});
