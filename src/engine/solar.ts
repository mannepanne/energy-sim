// ABOUT: Solar position, isotropic-sky irradiance on tilted surfaces, and hourly mean vertical irradiance
// ABOUT: Formulas follow Duffie and Beckman, Solar Engineering of Thermal Processes, chapters 1 and 2

import { DAYS_PER_YEAR, HOURS_PER_DAY, HOURS_PER_YEAR, MINUTES_PER_HOUR, RADIANS_PER_DEGREE } from './constants.ts';

/** The sun's hour angle moves 15° an hour; one degree of longitude is four minutes of solar time. */
const DEGREES_PER_HOUR = 15;
const MINUTES_PER_DEGREE_OF_LONGITUDE = 4;
const SOLAR_NOON_HOUR = 12;

export interface SunAngles {
  /** Solar declination, radians. */
  declination: number;
  /** Hour angle, radians: negative in the morning, zero at solar noon. */
  hourAngle: number;
}

export interface Surface {
  /** Tilt from horizontal, radians (π/2 for a wall). */
  tilt: number;
  /** Azimuth, radians, measured from south with west positive (Duffie and Beckman's γ). */
  azimuth: number;
}

/** Hourly irradiance in W/m², as PVGIS gives it. */
export interface HourIrradiance {
  globalHorizontal: number;
  beamNormal: number;
  diffuseHorizontal: number;
}

/** Spencer's day angle B, radians, for day `dayOfYear` (1 = 1 January). */
function dayAngle(dayOfYear: number): number {
  return (2 * Math.PI * (dayOfYear - 1)) / DAYS_PER_YEAR;
}

/** Solar declination, radians, by Spencer (1971) (Duffie and Beckman eq. 1.6.1b). */
export function declination(dayOfYear: number): number {
  const b = dayAngle(dayOfYear);
  return (
    0.006918 -
    0.399912 * Math.cos(b) +
    0.070257 * Math.sin(b) -
    0.006758 * Math.cos(2 * b) +
    0.000907 * Math.sin(2 * b) -
    0.002697 * Math.cos(3 * b) +
    0.00148 * Math.sin(3 * b)
  );
}

/** Equation of time, minutes, by Spencer (1971) (Duffie and Beckman eq. 1.5.3). */
export function equationOfTimeMinutes(dayOfYear: number): number {
  const b = dayAngle(dayOfYear);
  return (
    229.2 *
    (0.000075 + 0.001868 * Math.cos(b) - 0.032077 * Math.sin(b) - 0.014615 * Math.cos(2 * b) - 0.04089 * Math.sin(2 * b))
  );
}

/**
 * Declination and hour angle at a UTC time.
 * `hourUtc` may carry a fraction (10 minutes past is +1/6); `longitudeDeg` is east-positive.
 */
export function sunAngles(dayOfYear: number, hourUtc: number, longitudeDeg: number): SunAngles {
  const solarTimeHours =
    hourUtc + (MINUTES_PER_DEGREE_OF_LONGITUDE * longitudeDeg + equationOfTimeMinutes(dayOfYear)) / MINUTES_PER_HOUR;
  return {
    declination: declination(dayOfYear),
    hourAngle: DEGREES_PER_HOUR * (solarTimeHours - SOLAR_NOON_HOUR) * RADIANS_PER_DEGREE,
  };
}

/** Cosine of the solar zenith angle (Duffie and Beckman eq. 1.6.5). */
export function cosZenith(latitude: number, sun: SunAngles): number {
  return (
    Math.cos(latitude) * Math.cos(sun.declination) * Math.cos(sun.hourAngle) +
    Math.sin(latitude) * Math.sin(sun.declination)
  );
}

/** Cosine of the angle of incidence of beam radiation on a surface (Duffie and Beckman eq. 1.6.2). */
export function cosIncidence(latitude: number, sun: SunAngles, surface: Surface): number {
  const { declination: d, hourAngle: w } = sun;
  const { tilt: b, azimuth: g } = surface;
  return (
    Math.sin(d) * Math.sin(latitude) * Math.cos(b) -
    Math.sin(d) * Math.cos(latitude) * Math.sin(b) * Math.cos(g) +
    Math.cos(d) * Math.cos(latitude) * Math.cos(b) * Math.cos(w) +
    Math.cos(d) * Math.sin(latitude) * Math.sin(b) * Math.cos(g) * Math.cos(w) +
    Math.cos(d) * Math.sin(b) * Math.sin(g) * Math.sin(w)
  );
}

/**
 * Irradiance on a tilted surface by the isotropic-sky model (Liu and Jordan; Duffie and Beckman eq. 2.15.1):
 * beam on the surface, plus sky diffuse × (1 + cos β)/2, plus ground-reflected global × ρ (1 − cos β)/2.
 * Beam counts only when the sun is above the horizon and in front of the surface.
 */
export function tiltedIrradiance(
  irradiance: HourIrradiance,
  cosIncidenceAngle: number,
  sunAboveHorizon: boolean,
  tilt: number,
  groundReflectance: number,
): number {
  const beam = sunAboveHorizon ? irradiance.beamNormal * Math.max(0, cosIncidenceAngle) : 0;
  const skyDiffuse = (irradiance.diffuseHorizontal * (1 + Math.cos(tilt))) / 2;
  const groundReflected = (irradiance.globalHorizontal * groundReflectance * (1 - Math.cos(tilt))) / 2;
  return beam + skyDiffuse + groundReflected;
}

/** Walls facing north, east, south and west, the four orientations the windows are split across. */
export const FOUR_WALLS: readonly Surface[] = [180, -90, 0, 90].map((azimuthDeg) => ({
  tilt: 90 * RADIANS_PER_DEGREE,
  azimuth: azimuthDeg * RADIANS_PER_DEGREE,
}));

export interface IrradianceSeries {
  latitudeDeg: number;
  longitudeDeg: number;
  globalHorizontal: Float64Array;
  beamNormal: Float64Array;
  diffuseHorizontal: Float64Array;
}

/**
 * Hourly irradiance on a vertical wall, averaged over north, east, south and west, in W/m².
 * Hour i of the series is day ⌊i/24⌋ + 1 at (i mod 24) UTC; the sun's position is taken
 * `sampleMinute` minutes past the hour, the moment the irradiance values describe.
 */
export function meanVerticalIrradiance(series: IrradianceSeries, sampleMinute: number, groundReflectance: number): Float64Array {
  const latitude = series.latitudeDeg * RADIANS_PER_DEGREE;
  const result = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const dayOfYear = Math.floor(hour / HOURS_PER_DAY) + 1;
    const sun = sunAngles(dayOfYear, (hour % HOURS_PER_DAY) + sampleMinute / MINUTES_PER_HOUR, series.longitudeDeg);
    const sunAboveHorizon = cosZenith(latitude, sun) > 0;
    const irradiance: HourIrradiance = {
      globalHorizontal: series.globalHorizontal[hour]!,
      beamNormal: series.beamNormal[hour]!,
      diffuseHorizontal: series.diffuseHorizontal[hour]!,
    };
    let sum = 0;
    for (const wall of FOUR_WALLS) {
      sum += tiltedIrradiance(irradiance, cosIncidence(latitude, sun, wall), sunAboveHorizon, wall.tilt, groundReflectance);
    }
    result[hour] = sum / FOUR_WALLS.length;
  }
  return result;
}
