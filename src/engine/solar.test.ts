// ABOUT: Tests for solar position and irradiance on walls, against Duffie and Beckman's worked examples
// ABOUT: Also checks, on the real PVGIS snapshot, that beam and diffuse add up to global at the chosen sample minute

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import { HOURS_PER_YEAR, RADIANS_PER_DEGREE } from './constants.ts';
import {
  cosIncidence,
  cosZenith,
  declination,
  equationOfTimeMinutes,
  FOUR_WALLS,
  meanVerticalIrradiance,
  sunAngles,
  tiltedIrradiance,
} from './solar.ts';
import { weatherFromSnapshot } from './weather.ts';

const deg = (degrees: number): number => degrees * RADIANS_PER_DEGREE;
const toDeg = (radians: number): number => radians / RADIANS_PER_DEGREE;
const MADISON = deg(43);

describe('solar geometry (Duffie and Beckman, 4th edition)', () => {
  it('Example 1.6.1: beam incidence on a 45° surface facing 15° west of south at 10:30 on 13 February is 35°', () => {
    const cos = cosIncidence(MADISON, { declination: deg(-14), hourAngle: deg(-22.5) }, { tilt: deg(45), azimuth: deg(15) });
    expect(toDeg(Math.acos(cos))).toBeCloseTo(35, 0);
    expect(Math.abs(cos / Math.cos(deg(35)) - 1)).toBeLessThan(0.02);
  });

  it('Example 1.6.2: the zenith angle at 9:30 on 13 February is 66.5° and at 18:30 on 1 July is 79.6°', () => {
    expect(toDeg(Math.acos(cosZenith(MADISON, { declination: deg(-14), hourAngle: deg(-37.5) })))).toBeCloseTo(66.5, 0);
    expect(toDeg(Math.acos(cosZenith(MADISON, { declination: deg(23.1), hourAngle: deg(97.5) })))).toBeCloseTo(79.6, 0);
  });

  it('gives Spencer’s declination: about −14° on 13 February, +23.1° on 1 July, near 0 at the equinoxes', () => {
    expect(toDeg(declination(44))).toBeCloseTo(-13.6, 0);
    expect(toDeg(declination(182))).toBeCloseTo(23.1, 0);
    expect(Math.abs(toDeg(declination(80)))).toBeLessThan(1);
  });

  it('gives an equation of time of about −14 minutes in mid-February and +16 minutes in early November', () => {
    expect(equationOfTimeMinutes(44)).toBeCloseTo(-14.3, 0);
    expect(equationOfTimeMinutes(307)).toBeCloseTo(16.4, 0);
  });

  it('puts London’s midsummer noon sun at 90 − 51.5 + 23.44 ≈ 61.9° above the horizon', () => {
    const latitude = deg(51.507);
    let highest = -Infinity;
    for (let minute = 0; minute < 120; minute += 1) {
      const sun = sunAngles(172, 11 + minute / 60, -0.128);
      highest = Math.max(highest, 90 - toDeg(Math.acos(cosZenith(latitude, sun))));
    }
    expect(highest).toBeCloseTo(61.9, 0);
  });
});

describe('tiltedIrradiance (isotropic sky)', () => {
  const hour = { globalHorizontal: 500, beamNormal: 600, diffuseHorizontal: 200 };

  it('adds beam × cos θ, half the sky diffuse and a tenth of global at ρ = 0.2 on a wall', () => {
    expect(tiltedIrradiance(hour, 0.5, true, deg(90), 0.2)).toBeCloseTo(600 * 0.5 + 200 / 2 + 500 * 0.2 / 2, 9);
  });

  it('drops the beam when the sun is behind the wall or below the horizon', () => {
    expect(tiltedIrradiance(hour, -0.3, true, deg(90), 0.2)).toBeCloseTo(150, 9);
    expect(tiltedIrradiance(hour, 0.8, false, deg(90), 0.2)).toBeCloseTo(150, 9);
  });

  it('equals global horizontal on a flat surface with the sun at cos θ = cos zenith', () => {
    const cosZ = (500 - 200) / 600;
    expect(tiltedIrradiance(hour, cosZ, true, 0, 0.2)).toBeCloseTo(500, 9);
  });

  it('on a south wall at solar noon at an equinox, the beam arrives at cos θ = sin(latitude)', () => {
    const latitude = deg(51.5);
    const south = FOUR_WALLS[2]!;
    expect(south.azimuth).toBe(0);
    expect(cosIncidence(latitude, { declination: 0, hourAngle: 0 }, south)).toBeCloseTo(Math.sin(latitude), 12);
  });
});

describe('meanVerticalIrradiance on the PVGIS snapshot', () => {
  const snapshot = loadPvgisSnapshot(
    JSON.parse(readFileSync(new URL('../../data/snapshots/pvgis-tmy-london.json', import.meta.url), 'utf8')) as unknown,
  );
  const weather = weatherFromSnapshot(snapshot);

  /** Mean |Gb(n) cos Z + Gd(h) − G(h)| over the year, as a share of annual G(h), with the sun at `minute` past the hour. */
  const closure = (minute: number): number => {
    const latitude = deg(weather.latitudeDeg);
    let mismatch = 0;
    let total = 0;
    for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
      const sun = sunAngles(Math.floor(hour / 24) + 1, (hour % 24) + minute / 60, weather.longitudeDeg);
      const beam = weather.beamNormal[hour]! * Math.max(0, cosZenith(latitude, sun));
      mismatch += Math.abs(beam + weather.diffuseHorizontal[hour]! - weather.globalHorizontal[hour]!);
      total += weather.globalHorizontal[hour]!;
    }
    return mismatch / total;
  };

  it('places the sun correctly: beam plus diffuse matches global to within 0.5% at 10 minutes past the hour', () => {
    expect(closure(10)).toBeLessThan(0.005);
    expect(closure(10)).toBeLessThan(closure(0));
    expect(closure(10)).toBeLessThan(closure(30));
  });

  it('gives 8,760 non-negative hours, zero at midnight in winter and a plausible annual mean', () => {
    const vertical = meanVerticalIrradiance(weather, 10, 0.2);
    expect(vertical).toHaveLength(HOURS_PER_YEAR);
    expect(vertical.every((value) => value >= 0)).toBe(true);
    expect(vertical[0]).toBe(0);
    const mean = vertical.reduce((sum, value) => sum + value, 0) / HOURS_PER_YEAR;
    expect(mean).toBeGreaterThan(60);
    expect(mean).toBeLessThan(90);
  });
});
