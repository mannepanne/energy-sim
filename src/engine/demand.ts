// ABOUT: Hourly space heat at a mean internal temperature, solar and internal gains, and daily hot water
// ABOUT: Q(t) = max(0, H (T_mean − T_out(t)) − G_solar(t) − G_internal), over 8,760 hours in typed arrays

import { HOURS_PER_DAY, HOURS_PER_YEAR, KJ_PER_KWH, WATER_SPECIFIC_HEAT_KJ_PER_KGK, WH_PER_KWH } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

/** Solar gains through the windows, W per hour: area × g × frame factor × solar access × mean vertical irradiance. */
export function solarGainsW(inputs: EngineInputs, meanVerticalIrradiance: Float64Array): Float64Array {
  const transmittingAreaM2 =
    inputs.windowAreaM2 * inputs.windowGValue * inputs.windowFrameFactor * inputs.solarAccessFactor;
  return meanVerticalIrradiance.map((irradiance) => transmittingAreaM2 * irradiance);
}

/**
 * Space heat in kWh for each hour. `outdoorTemperatureC` is the weather as given; the register's offset is added here.
 * Each hour lasts one hour, so the hour's mean power in W divided by 1,000 is its energy in kWh.
 */
export function hourlySpaceHeatKwh(
  inputs: EngineInputs,
  heatLossWPerK: number,
  outdoorTemperatureC: Float64Array,
  solarGains: Float64Array,
): Float64Array {
  if (outdoorTemperatureC.length !== HOURS_PER_YEAR || solarGains.length !== HOURS_PER_YEAR) {
    throw new Error(`Weather and solar gains must each have ${HOURS_PER_YEAR} hours`);
  }
  const result = new Float64Array(HOURS_PER_YEAR);
  for (let hour = 0; hour < HOURS_PER_YEAR; hour += 1) {
    const outdoor = outdoorTemperatureC[hour]! + inputs.outdoorTemperatureOffsetK;
    const netW = heatLossWPerK * (inputs.meanInternalTemperatureC - outdoor) - solarGains[hour]! - inputs.internalGainsW;
    result[hour] = Math.max(0, netW) / WH_PER_KWH;
  }
  return result;
}

/** Heat to deliver the day's hot water, in kWh: L × 4.18 × (T_delivery − T_cold) ÷ 3,600. No standing losses. */
export function dailyHotWaterKwh(inputs: EngineInputs): number {
  const riseK = inputs.hotWaterDeliveryTemperatureC - inputs.coldFeedTemperatureC;
  return (inputs.hotWaterLitresPerDay * WATER_SPECIFIC_HEAT_KJ_PER_KGK * riseK) / KJ_PER_KWH;
}

/** A daily amount spread evenly over the hours of every day, in kWh per hour. */
export function evenHourly(kwhPerDay: number): Float64Array {
  return new Float64Array(HOURS_PER_YEAR).fill(kwhPerDay / HOURS_PER_DAY);
}
