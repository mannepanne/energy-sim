// ABOUT: The pre-registered PV check: the reference system, the PVGIS PVcalc request and the tolerance
// ABOUT: Fixed on 19 October 2026, before PVcalc was called or the engine's PV yield was computed

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
