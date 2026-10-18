// ABOUT: Provisional calibration of the register's mean internal temperature to the NEED gas target
// ABOUT: Uses the benchmark's rough monthly method on the register's own rows; the engine PR re-solves it hourly

import type { RegisterAccessor } from '../../src/register/access.ts';
import { degreeDayMethod, londonClimate, occupancy } from './draftValues.ts';
import { annualDegreeDays, annualSpaceHeatKwh, heatLossCoefficient } from './heatDemand.ts';

/** The target fixed in the calibration ADR before the engine existed, and its tolerance (NEED readings A–C). */
export const NEED_GAS_TARGET_KWH = 13_200;
export const NEED_GAS_RANGE_KWH = { low: 10_980, high: 15_433 } as const;

/** Specific heat of water, kJ per kg per K, with one litre taken as one kilogram. A physical constant. */
const WATER_SPECIFIC_HEAT_KJ_PER_KGK = 4.18;
const KJ_PER_KWH = 3600;
const DAYS_PER_YEAR = 365;

/**
 * Annual gas use (kWh) of the archetype's gas setup at a given mean internal temperature, by the rough
 * monthly method: (space heat + hot water) ÷ boiler efficiency. Every input comes from the register except
 * the benchmark's constant solar gains, Heathrow monthly climate and Hitchin constant, which the hourly
 * engine replaces.
 */
export function roughAnnualGasKwh(access: RegisterAccessor, meanInternalTemperatureC: number): number {
  const fixedValue = (id: Parameters<RegisterAccessor['fixed']>[0]): number => access.fixed(id).value;
  const heatLoss = heatLossCoefficient({
    elements: [
      { name: 'walls', areaM2: fixedValue('geometry.externalWallArea'), uValueWPerM2K: fixedValue('fabric.wallUValue') },
      { name: 'windows', areaM2: fixedValue('geometry.windowArea'), uValueWPerM2K: fixedValue('fabric.windowUValue') },
      { name: 'door', areaM2: fixedValue('geometry.doorArea'), uValueWPerM2K: fixedValue('fabric.doorUValue') },
      { name: 'roof', areaM2: fixedValue('geometry.roofArea'), uValueWPerM2K: fixedValue('fabric.roofUValue') },
      { name: 'floor', areaM2: fixedValue('geometry.groundFloorArea'), uValueWPerM2K: fixedValue('fabric.groundFloorUValue') },
    ],
    airChangesPerHour: fixedValue('fabric.airChangeRate'),
    heatedVolumeM3: fixedValue('geometry.heatedVolume'),
  });
  const fabricFactor = access.uncertain('fabric.qualityFactor').default;
  const h = heatLoss.totalWPerK * fabricFactor;
  const gainsW = access.uncertain('gains.internalGains').default + occupancy.solarGainsW.value;
  const degreeDays = annualDegreeDays(londonClimate.months, meanInternalTemperatureC - gainsW / h, degreeDayMethod.hitchinK.value);
  const spaceHeatKwh = annualSpaceHeatKwh(h, degreeDays);

  const litres = access.uncertain('hotWater.litresPerDay').default;
  const riseK = fixedValue('hotWater.deliveryTemperature') - fixedValue('hotWater.coldFeedTemperature');
  const hotWaterKwh = ((litres * WATER_SPECIFIC_HEAT_KJ_PER_KGK * riseK) / KJ_PER_KWH) * DAYS_PER_YEAR;

  return (spaceHeatKwh + hotWaterKwh) / access.uncertain('heating.boilerSeasonalEfficiency').default;
}

/** The mean internal temperature at which rough annual gas use equals `targetGasKwh`, found by bisection. */
export function solveMeanInternalTemperature(access: RegisterAccessor, targetGasKwh: number): number {
  let low = 5;
  let high = 25;
  if (roughAnnualGasKwh(access, low) > targetGasKwh || roughAnnualGasKwh(access, high) < targetGasKwh) {
    throw new Error(`No temperature between ${low} and ${high} °C gives ${targetGasKwh} kWh of gas`);
  }
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (roughAnnualGasKwh(access, middle) < targetGasKwh) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
