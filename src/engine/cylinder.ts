// ABOUT: The heat pump setups' hot water cylinder as one stored-energy state, stepped hour by hour
// ABOUT: Draw-off and standing loss empty it; it is reheated below its minimum and, under control, topped up in cheap hours

import { HOURS_PER_DAY, KJ_PER_KWH, WATER_SPECIFIC_HEAT_KJ_PER_KGK } from './constants.ts';
import { CHEAP } from './tariffs.ts';

export interface Cylinder {
  volumeLitres: number;
  setpointC: number;
  /** The reheat is forced when the stored heat falls below this temperature's. */
  minimumC: number;
  coldFeedC: number;
  standingLossKwhPerDay: number;
}

export interface CylinderRun {
  /** Heat the heat pump puts into the cylinder in each hour. */
  reheatKwh: Float64Array;
  /** Stored heat above the cold feed at the end of each hour. */
  storedKwh: Float64Array;
  /** Stored heat at the start of the year: the cylinder starts at its setpoint. */
  initialStoredKwh: number;
  /** Stored heat at the minimum temperature. */
  minimumStoredKwh: number;
}

/** Heat stored in the cylinder above the cold feed, kWh, when it is all at one temperature. */
export function storedHeatKwh(cylinder: Pick<Cylinder, 'volumeLitres' | 'coldFeedC'>, temperatureC: number): number {
  return (cylinder.volumeLitres * WATER_SPECIFIC_HEAT_KJ_PER_KGK * (temperatureC - cylinder.coldFeedC)) / KJ_PER_KWH;
}

export function checkCylinder(cylinder: Cylinder): void {
  if (!(cylinder.volumeLitres > 0)) throw new Error(`The cylinder volume must be positive, got ${cylinder.volumeLitres} litres`);
  if (!(cylinder.coldFeedC < cylinder.minimumC && cylinder.minimumC < cylinder.setpointC)) {
    throw new Error(
      `The cylinder needs cold feed < minimum < setpoint, got ${cylinder.coldFeedC}, ${cylinder.minimumC} and ${cylinder.setpointC} °C`,
    );
  }
  if (!(cylinder.standingLossKwhPerDay >= 0)) throw new Error(`The standing loss must not be negative, got ${cylinder.standingLossKwhPerDay} kWh a day`);
}

/**
 * Steps the cylinder through the year. Each hour, the draw-off and an hour's standing loss come out; if the stored
 * heat is then below the minimum, the heat pump reheats it to the setpoint within the hour. Under control (`band`
 * given), it is also topped up to the setpoint in every cheap hour, so the forced reheat rarely falls outside them.
 * Standing loss does not depend on the stored temperature here, so topping up moves reheats in time without adding heat. The store is one
 * temperature (no stratification), so the minimum is a reheat trigger, not a tap temperature: the draw-off is the
 * heat the taps need, whatever the cylinder's temperature. No immersion backup is modelled.
 * The cylinder starts the year full and ends it wherever the last hour leaves it, so the year's reheats equal
 * draw-off plus standing loss minus the fall in stored heat, which is at most the band between setpoint and minimum.
 */
export function runCylinder(drawKwh: Float64Array, cylinder: Cylinder, band?: Int8Array): CylinderRun {
  checkCylinder(cylinder);
  if (band && band.length !== drawKwh.length) throw new Error(`Tariff bands have ${band.length} hours; the draw-off has ${drawKwh.length}`);
  const full = storedHeatKwh(cylinder, cylinder.setpointC);
  const minimum = storedHeatKwh(cylinder, cylinder.minimumC);
  const lossPerHour = cylinder.standingLossKwhPerDay / HOURS_PER_DAY;
  const reheatKwh = new Float64Array(drawKwh.length);
  const storedKwh = new Float64Array(drawKwh.length);
  let stored = full;
  for (let hour = 0; hour < drawKwh.length; hour += 1) {
    stored -= drawKwh[hour]! + lossPerHour;
    if (stored < minimum || (band?.[hour] === CHEAP && stored < full)) {
      reheatKwh[hour] = full - stored;
      stored = full;
    }
    storedKwh[hour] = stored;
  }
  return { reheatKwh, storedKwh, initialStoredKwh: full, minimumStoredKwh: minimum };
}
