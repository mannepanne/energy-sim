// ABOUT: Hourly gains (solar through the windows plus internal) and the day's hot water
// ABOUT: Space heat comes from the thermal node (thermal.ts), which these gains feed

import { KJ_PER_KWH, WATER_SPECIFIC_HEAT_KJ_PER_KGK } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

/**
 * Solar gains through the windows, W per hour (SAP 10.2 equation 5):
 * 0.9 × area × g⊥ × frame factor × solar access × mean vertical irradiance.
 */
export function solarGainsW(inputs: EngineInputs, meanVerticalIrradiance: Float64Array): Float64Array {
  const transmittingAreaM2 =
    inputs.nonNormalIncidenceFactor * inputs.windowAreaM2 * inputs.windowGValue * inputs.windowFrameFactor * inputs.solarAccessFactor;
  return meanVerticalIrradiance.map((irradiance) => transmittingAreaM2 * irradiance);
}

/** Solar plus internal gains each hour, W. */
export function totalGainsW(inputs: EngineInputs, meanVerticalIrradiance: Float64Array): Float64Array {
  const gains = solarGainsW(inputs, meanVerticalIrradiance);
  for (let hour = 0; hour < gains.length; hour += 1) gains[hour] = gains[hour]! + inputs.internalGainsW;
  return gains;
}

/** Heat to deliver the day's hot water, in kWh: L × 4.18 × (T_delivery − T_cold) ÷ 3,600. No standing losses. */
export function dailyHotWaterKwh(inputs: EngineInputs): number {
  const riseK = inputs.hotWaterDeliveryTemperatureC - inputs.coldFeedTemperatureC;
  return (inputs.hotWaterLitresPerDay * WATER_SPECIFIC_HEAT_KJ_PER_KGK * riseK) / KJ_PER_KWH;
}
