// ABOUT: The pre-registered PV check: the engine's yield for the reference system against PVGIS PVcalc, within 8%
// ABOUT: Also checks that the request, the committed snapshot and the register's PV defaults describe one system

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readInputs } from '../../src/engine/inputs.ts';
import { prepareWeather, weatherFromSnapshot } from '../../src/engine/weather.ts';
import { createAccessor } from '../../src/register/access.ts';
import { loadRegister } from '../../src/register/load.ts';
import { loadPvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { loadPvcalcSnapshot, serialisePvcalcSnapshot, trimPvcalcResponse } from './pvcalc.ts';
import { PV_CHECK_TOLERANCE, pvCheck, pvcalcRequestUrl, REFERENCE_SYSTEM, withinTolerance } from './pvcalcCheck.ts';

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
const access = createAccessor(loadRegister(readJson('../../data/register.json')));
const inputs = readInputs(access);
const weather = prepareWeather(weatherFromSnapshot(loadPvgisSnapshot(readJson('../../data/snapshots/pvgis-tmy-london.json'))), inputs);
const pvcalc = loadPvcalcSnapshot(readJson('../../data/snapshots/pvgis-pvcalc-london.json'));

/** The gap measured on 19 October 2026, pinned so a change to the PV method or rows shows up here. */
const MEASURED_GAP = -0.0255;

describe('the pre-registration', () => {
  it('keeps the 8% tolerance', () => {
    expect(PV_CHECK_TOLERANCE).toBe(0.08);
    expect(withinTolerance(108, 100)).toBe(true);
    expect(withinTolerance(91.9, 100)).toBe(false);
  });

  it('requests the reference system from PVcalc, and the snapshot was made from that request', () => {
    const url = new URL(pvcalcRequestUrl());
    expect(url.pathname).toBe('/api/v5_3/PVcalc');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ peakpower: '4', loss: '14', angle: '35', aspect: '0', mountingplace: 'free', raddatabase: 'PVGIS-SARAH3' });
    expect(pvcalc.requestUrl).toBe(pvcalcRequestUrl());
    expect(pvcalc.system).toMatchObject({ peakPowerKw: 4, systemLossPercent: 14, tiltDeg: 35, aspectDeg: 0, radiationDatabase: 'PVGIS-SARAH3', useHorizon: true });
  });

  it('matches the register’s PV defaults and the typical year’s location', () => {
    expect(access.fixed('solar.tilt').value).toBe(REFERENCE_SYSTEM.tiltDeg);
    expect(access.uncertain('solar.azimuth').default).toBe(REFERENCE_SYSTEM.aspectDeg);
    expect(access.fixed('solar.systemLoss').value * 100).toBeCloseTo(REFERENCE_SYSTEM.lossPercent, 12);
    expect(access.uncertain('solar.systemSize').default).toBe(REFERENCE_SYSTEM.peakPowerKw);
    expect(weather.irradiance.latitudeDeg).toBe(REFERENCE_SYSTEM.latitude);
    expect(weather.irradiance.longitudeDeg).toBe(REFERENCE_SYSTEM.longitude);
  });
});

describe('the PV check', () => {
  const check = pvCheck(inputs, weather, pvcalc);

  it('is within 8% of PVcalc for the reference system', () => {
    expect(check.pvcalcKwh).toBe(4075.36);
    expect(check.withinTolerance).toBe(true);
    expect(Math.abs(check.gap)).toBeLessThan(PV_CHECK_TOLERANCE);
    expect(check.gap).toBeCloseTo(MEASURED_GAP, 3);
  });

  it('records the breakdown: less irradiance on the panel, a smaller temperature loss, no reflection or spectral terms', () => {
    // Irradiance on the panel: the typical year and the isotropic sky give 6.6% less than PVcalc's multi-year Perez sky.
    expect(check.engineInPlaneKwhPerM2 / check.pvcalcInPlaneKwhPerM2 - 1).toBeCloseTo(-0.066, 3);
    // Temperature: the engine loses 2.0%, against PVcalc's 4.8% for temperature and low irradiance together.
    expect(check.engineTemperatureLossPercent).toBeCloseTo(-2.0, 1);
    expect(pvcalc.lossesPercent).toEqual({ angleOfIncidence: -3.14, spectral: 1.92, temperatureAndIrradiance: -4.83, total: -19.2 });
    // PVcalc's own terms multiply back to its yield, so the breakdown is complete.
    const { angleOfIncidence, spectral, temperatureAndIrradiance } = pvcalc.lossesPercent;
    const rebuilt =
      4 * pvcalc.annualInPlaneKwhPerM2 * (1 + angleOfIncidence / 100) * (1 + spectral / 100) * (1 + temperatureAndIrradiance / 100) * (1 - 0.14);
    expect(rebuilt / pvcalc.annualKwh).toBeCloseTo(1, 3);
  });

  it('throws if the register’s defaults stop describing the reference system', () => {
    expect(() => pvCheck({ ...inputs, pv: { ...inputs.pv, tilt: 0.5 } }, weather, pvcalc)).toThrow('pre-registered reference system');
  });
});

describe('trimPvcalcResponse', () => {
  const months = Array.from({ length: 12 }, (_, index) => ({ month: 12 - index, E_m: 12 - index, 'H(i)_m': 2 * (12 - index) }));
  const response = {
    inputs: {
      location: { latitude: 51.5, longitude: 0 },
      meteo_data: { radiation_db: 'PVGIS-SARAH3', year_min: 2005, year_max: 2023, use_horizon: true },
      mounting_system: { fixed: { slope: { value: 35 }, azimuth: { value: 0 }, type: 'free-standing' } },
      pv_module: { technology: 'c-Si', peak_power: 4, system_loss: 14 },
    },
    outputs: {
      monthly: { fixed: months },
      totals: { fixed: { E_y: 78, 'H(i)_y': 156, l_aoi: -3, l_spec: '1.5', l_tg: -5, l_total: '-20' } },
    },
  };
  const details = { requestUrl: 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?x=1', fetchedOn: '2026-10-19', responseSha256: 'a'.repeat(64) };

  it('keeps the totals in month order, reads losses given as text, and validates', () => {
    const snapshot = trimPvcalcResponse(response, details);
    expect(snapshot.monthlyKwh).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(snapshot.monthlyInPlaneKwhPerM2[0]).toBe(2);
    expect(snapshot.lossesPercent).toEqual({ angleOfIncidence: -3, spectral: 1.5, temperatureAndIrradiance: -5, total: -20 });
    expect(snapshot.system.years).toEqual([2005, 2023]);
    expect(snapshot.attribution).toContain('PVGIS © European Union');
  });

  it('serialises to JSON that loads back unchanged, ending in a newline', () => {
    const snapshot = trimPvcalcResponse(response, details);
    const text = serialisePvcalcSnapshot(snapshot);
    expect(text.endsWith('}\n')).toBe(true);
    expect(loadPvcalcSnapshot(JSON.parse(text) as unknown)).toEqual(snapshot);
  });

  it('rejects a response with missing months or a loss that is not a number', () => {
    expect(() => trimPvcalcResponse({ ...response, outputs: { ...response.outputs, monthly: { fixed: months.slice(1) } } }, details)).toThrow('"monthly"');
    const badLoss = { ...response.outputs.totals.fixed, l_spec: 'n/a' };
    expect(() => trimPvcalcResponse({ ...response, outputs: { ...response.outputs, totals: { fixed: badLoss } } }, details)).toThrow('"l_spec"');
  });
});
