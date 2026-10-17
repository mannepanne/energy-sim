// ABOUT: Combines the draft archetype values with the heat-demand functions
// ABOUT: Produces the estimate for each roof variant and the README's results tables

import { archetype, degreeDayMethod, londonClimate, occupancy, uValues, ventilation } from './draftValues.ts';
import type { DraftValue } from './draftValues.ts';
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

export interface RoofVariant {
  label: string;
  uValue: DraftValue;
}

/** The main case first, then the variant. */
export const ROOF_VARIANTS: [RoofVariant, ...RoofVariant[]] = [
  { label: '100 mm loft insulation (main case)', uValue: uValues.roof },
  { label: 'no loft insulation (variant)', uValue: uValues.roofNoInsulation },
];

export function roughEstimate(roofUValueWPerM2K: number): RoughEstimate {
  const elements: FabricElement[] = [
    { name: 'External walls (unfilled cavity)', areaM2: archetype.netWallAreaM2.value, uValueWPerM2K: uValues.wall.value },
    { name: 'Windows (double glazed)', areaM2: archetype.windowAreaM2.value, uValueWPerM2K: uValues.window.value },
    { name: 'Door', areaM2: archetype.doorAreaM2.value, uValueWPerM2K: uValues.door.value },
    { name: 'Roof', areaM2: archetype.roofAreaM2.value, uValueWPerM2K: roofUValueWPerM2K },
    {
      name: 'Ground floor (suspended timber)',
      areaM2: archetype.groundFloorAreaM2.value,
      uValueWPerM2K: uValues.floor.value,
    },
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

const fixed = (value: number, places: number): string => value.toFixed(places);
const grouped = (value: number): string => Math.round(value).toLocaleString('en-GB');

/** The two results tables in the benchmark README, for every roof variant side by side. */
export function resultsMarkdown(): string {
  const results = ROOF_VARIANTS.map((variant) => roughEstimate(variant.uValue.value));
  const labels = ROOF_VARIANTS.map((variant) => variant.label);
  const cells = (format: (result: RoughEstimate) => string): string => results.map(format).join(' | ');

  // Every variant lists the same elements in the same order; only the roof's U-value differs.
  const elementRows = roughEstimate(ROOF_VARIANTS[0].uValue.value).elements.map((element, index) => {
    const elementIn = (result: RoughEstimate): FabricElement => result.elements[index]!;
    const distinctU = [...new Set(results.map((r) => fixed(elementIn(r).uValueWPerM2K, 2)))].join(' or ');
    const products = cells((r) => fixed(elementIn(r).areaM2 * elementIn(r).uValueWPerM2K, 1));
    return `| ${element.name} | ${fixed(element.areaM2, 1)} | ${distinctU} | ${products} |`;
  });

  return [
    `| Element | Area (m²) | U (W/m²K) | ${labels.map((label) => `U × A (W/K), ${label}`).join(' | ')} |`,
    `| --- | ---: | ---: | ${labels.map(() => '---:').join(' | ')} |`,
    ...elementRows,
    `| Ventilation (${fixed(ventilation.airChangesPerHour.value, 1)} ach × ${fixed(archetype.heatedVolumeM3.value, 0)} m³) | | | ${cells((r) => fixed(r.heatLoss.ventilationWPerK, 1))} |`,
    `| **H** | | | ${cells((r) => `**${fixed(r.heatLoss.totalWPerK, 0)}**`)} |`,
    '',
    `| | ${labels.join(' | ')} |`,
    `| --- | ${labels.map(() => '---:').join(' | ')} |`,
    `| Gains (${occupancy.internalGainsW.value} W internal + ${occupancy.solarGainsW.value} W solar) | ${cells((r) => `${grouped(r.gainsW)} W`)} |`,
    `| Mean internal temperature | ${cells(() => `${occupancy.meanInternalTemperatureC.value} °C`)} |`,
    `| Balance point | ${cells((r) => `${fixed(r.balancePointC, 1)} °C`)} |`,
    `| Degree days at that balance point | ${cells((r) => `${grouped(r.degreeDays)} K·day`)} |`,
    `| **Annual space heat** | ${cells((r) => `**${grouped(Math.round(r.annualSpaceHeatKwh / 100) * 100)} kWh**`)} |`,
  ].join('\n');
}
