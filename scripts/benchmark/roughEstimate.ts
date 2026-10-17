// ABOUT: Combines the draft archetype values with the heat-demand functions
// ABOUT: Produces H, balance point, degree days and annual space heat for one roof variant

import { archetype, degreeDayMethod, londonClimate, occupancy, uValues, ventilation } from './draftValues.ts';
import {
  annualDegreeDays,
  annualSpaceHeatKwh,
  balancePointTemperature,
  heatLossCoefficient,
  type FabricElement,
  type HeatLossResult,
} from './heatDemand.ts';

export interface RoughEstimate {
  elements: FabricElement[];
  heatLoss: HeatLossResult;
  gainsW: number;
  balancePointC: number;
  degreeDays: number;
  annualSpaceHeatKwh: number;
}

export function roughEstimate(roofUValueWPerM2K: number): RoughEstimate {
  const elements: FabricElement[] = [
    { name: 'External walls', areaM2: archetype.netWallAreaM2.value, uValueWPerM2K: uValues.wall.value },
    { name: 'Windows', areaM2: archetype.windowAreaM2.value, uValueWPerM2K: uValues.window.value },
    { name: 'Door', areaM2: archetype.doorAreaM2.value, uValueWPerM2K: uValues.door.value },
    { name: 'Roof', areaM2: archetype.roofAreaM2.value, uValueWPerM2K: roofUValueWPerM2K },
    { name: 'Ground floor', areaM2: archetype.groundFloorAreaM2.value, uValueWPerM2K: uValues.floor.value },
  ];
  const heatLoss = heatLossCoefficient({
    elements,
    airChangesPerHour: ventilation.airChangesPerHour.value,
    heatedVolumeM3: archetype.heatedVolumeM3.value,
  });
  const gainsW = occupancy.internalGainsW.value + occupancy.solarGainsW.value;
  const balancePointC = balancePointTemperature({
    meanInternalTemperatureC: occupancy.meanInternalTemperatureC.value,
    gainsW,
    heatLossCoefficientWPerK: heatLoss.totalWPerK,
  });
  const degreeDays = annualDegreeDays(londonClimate.months, balancePointC, degreeDayMethod.hitchinK.value);
  return {
    elements,
    heatLoss,
    gainsW,
    balancePointC,
    degreeDays,
    annualSpaceHeatKwh: annualSpaceHeatKwh(heatLoss.totalWPerK, degreeDays),
  };
}
