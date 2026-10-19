// ABOUT: The pre-registered PV check: the reference system, the PVGIS PVcalc request and the tolerance
// ABOUT: Fixed on 19 October 2026, before PVcalc was called or the engine's PV yield was computed; also runs the check

import { RADIANS_PER_DEGREE, WH_PER_KWH } from '../../src/engine/constants.ts';
import type { EngineInputs } from '../../src/engine/inputs.ts';
import { pvGenerationKwh } from '../../src/engine/pv.ts';
import { planeIrradiance } from '../../src/engine/solar.ts';
import type { PreparedWeather } from '../../src/engine/weather.ts';
import type { PvcalcSnapshot } from './pvcalc.ts';
import { PVGIS_API_VERSION } from './trim.ts';

/**
 * The share by which the engine's annual yield for the reference system may differ from PVcalc's.
 * PVcalc averages many years (the engine uses one typical year), uses a non-isotropic sky (the engine an isotropic
 * one) and a wind-driven module temperature model (the engine a fixed rise per W/m²), and models reflection and
 * spectral losses the engine leaves out, so 8% and not tighter. PVGIS's `seriescalc` returns real years only
 * (`startyear` to `endyear`), and its typical-year tool returns weather without PV output, so neither gives PV output
 * on the typical year directly, and the tolerance stays at 8%.
 */
export const PV_CHECK_TOLERANCE = 0.08;

/**
 * The reference system. Location, radiation database and horizon match the typical-year snapshot. Tilt and azimuth
 * are the register defaults (35°, facing south). `lossPercent` equals the register's system loss default (14%), so
 * system losses cancel out of the gap. `free` (free-standing) matches the open-rack module temperature behind the
 * register's cell temperature rise (NOCT 45 °C).
 */
export const REFERENCE_SYSTEM = {
  latitude: 51.507,
  longitude: -0.128,
  radiationDatabase: 'PVGIS-SARAH3',
  useHorizon: 1,
  technology: 'crystSi',
  peakPowerKw: 4,
  lossPercent: 14,
  tiltDeg: 35,
  /** PVGIS's aspect: 0 is south, 90 west, −90 east, the engine's azimuth convention. */
  aspectDeg: 0,
  mountingPlace: 'free',
} as const;

export function pvcalcRequestUrl(system: typeof REFERENCE_SYSTEM = REFERENCE_SYSTEM): string {
  const query = new URLSearchParams({
    lat: String(system.latitude),
    lon: String(system.longitude),
    raddatabase: system.radiationDatabase,
    usehorizon: String(system.useHorizon),
    pvtechchoice: system.technology,
    peakpower: String(system.peakPowerKw),
    loss: String(system.lossPercent),
    angle: String(system.tiltDeg),
    aspect: String(system.aspectDeg),
    mountingplace: system.mountingPlace,
    outputformat: 'json',
  });
  return `https://re.jrc.ec.europa.eu/api/${PVGIS_API_VERSION}/PVcalc?${query.toString()}`;
}

/** True when the engine's yield lies within the tolerance of PVcalc's, as a share of PVcalc's. */
export function withinTolerance(engineKwh: number, pvcalcKwh: number, tolerance: number = PV_CHECK_TOLERANCE): boolean {
  return Math.abs(engineKwh - pvcalcKwh) <= tolerance * pvcalcKwh;
}

export interface PvCheck {
  engineKwh: number;
  pvcalcKwh: number;
  /** Engine ÷ PVcalc − 1. */
  gap: number;
  withinTolerance: boolean;
  /** Irradiation on the panel, kWh/m²: the engine's typical year and isotropic sky, and PVcalc's. */
  engineInPlaneKwhPerM2: number;
  pvcalcInPlaneKwhPerM2: number;
  /** The engine's temperature loss, %, beside PVcalc's temperature and low-irradiance loss. */
  engineTemperatureLossPercent: number;
}

const sum = (values: Float64Array): number => values.reduce((total, value) => total + value, 0);

/**
 * The engine's yield for the reference system, using the register's PV rows at their defaults and the reference
 * system's size, against PVcalc's. The register's defaults must describe the reference system, or this throws.
 */
export function pvCheck(inputs: EngineInputs, weather: PreparedWeather, snapshot: PvcalcSnapshot): PvCheck {
  const system = { ...inputs.pv, peakPowerKw: REFERENCE_SYSTEM.peakPowerKw };
  const matches =
    Math.abs(system.tilt / RADIANS_PER_DEGREE - REFERENCE_SYSTEM.tiltDeg) < 1e-9 &&
    Math.abs(system.azimuth / RADIANS_PER_DEGREE - REFERENCE_SYSTEM.aspectDeg) < 1e-9 &&
    Math.abs(system.systemLoss * 100 - REFERENCE_SYSTEM.lossPercent) < 1e-9;
  if (!matches) throw new Error('The register’s PV defaults (tilt, azimuth, system loss) no longer describe the pre-registered reference system');
  const onRoof = planeIrradiance(weather.irradiance, weather.sunPath, system, inputs.groundReflectance);
  const engineKwh = sum(pvGenerationKwh(onRoof, weather.outdoorTemperatureC, system));
  const withoutTemperature = sum(pvGenerationKwh(onRoof, weather.outdoorTemperatureC, { ...system, temperatureCoefficientPerK: 0 }));
  const pvcalcKwh = snapshot.annualKwh;
  return {
    engineKwh,
    pvcalcKwh,
    gap: engineKwh / pvcalcKwh - 1,
    withinTolerance: withinTolerance(engineKwh, pvcalcKwh),
    engineInPlaneKwhPerM2: sum(onRoof) / WH_PER_KWH,
    pvcalcInPlaneKwhPerM2: snapshot.annualInPlaneKwhPerM2,
    engineTemperatureLossPercent: (engineKwh / withoutTemperature - 1) * 100,
  };
}
