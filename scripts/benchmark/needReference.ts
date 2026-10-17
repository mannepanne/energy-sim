// ABOUT: Measured-consumption references for benchmark step 3, from DESNZ NEED 2026 (2024 gas data)
// ABOUT: Converts metered gas to space heat so it can be compared with modelled annual space heat

import type { DraftSource, DraftValue } from './draftValues.ts';

export const NEED_MULTIPLE_ATTRIBUTES: DraftSource = {
  title: 'DESNZ NEED 2026, Consumption_multiple_attributes_EW_2024.xlsx, sheet "Table" (2024 rows)',
  url: 'https://assets.publishing.service.gov.uk/media/6a282785ade52dc08822182a/Consumption_multiple_attributes_EW_2024.xlsx',
};

export const NEED_GAS_PER_M2: DraftSource = {
  title: 'DESNZ NEED 2026, Consumption_gas_per_square_metre_EW_2024.xlsx, Tables 3.2c, 4.2c and 8.2c (2024)',
  url: 'https://assets.publishing.service.gov.uk/media/6a2827843b15d05a7ce31fa6/Consumption_gas_per_square_metre_EW_2024.xlsx',
};

/** Median weather-corrected gas use per m² of floor area, England and Wales houses, 2024. */
export const needMedianGasPerM2 = {
  allHouses: 104.9,
  builtFrom1919To1944: 122.0,
  semiDetached: 107.2,
  london: 125.9,
} as const;

/** London, semi-detached, built 1919–1944, 3 bedrooms, gas heated, standard electricity meter, 2024. */
export const needLondonThreeBedSemi = {
  sampleSize: 173_006,
  lowerQuartileGasKwh: 11_425,
  medianGasKwh: 15_433,
  upperQuartileGasKwh: 20_046,
} as const;

export const conversion = {
  boilerSeasonalEfficiency: {
    value: 0.85,
    unit: 'ratio',
    status: 'approximate',
    rationale:
      'Typical in-use seasonal efficiency of a gas combi boiler serving a 1930s house. Condensing boilers rarely reach their rated 89–92% at radiator flow temperatures of 60–70 °C.',
  },
  boilerSeasonalEfficiencyHigh: {
    value: 0.89,
    unit: 'ratio',
    status: 'approximate',
    rationale: 'Upper sensitivity: a well-set-up condensing boiler running at lower flow temperatures.',
  },
  hotWaterHeatKwh: {
    value: 1_700,
    unit: 'kWh/year',
    status: 'approximate',
    rationale:
      'About 100 litres a day of hot water for 2.5 occupants, heated from 10 °C to 50 °C: 100 × 4.18 × 40 ÷ 3600 ≈ 4.6 kWh a day.',
  },
} satisfies Record<string, DraftValue>;

/** Space heat implied by metered gas: gas × boiler efficiency, less the heat that went to hot water. */
export function spaceHeatFromGasKwh(gasKwh: number, boilerEfficiency: number, hotWaterHeatKwh: number): number {
  return gasKwh * boilerEfficiency - hotWaterHeatKwh;
}

export interface NeedReference {
  name: string;
  gasKwh: number;
  caveat: string;
}

/**
 * Three ways to read NEED for a 90 m² semi in London built in the 1930s. NEED has no 1930–49 band;
 * 1919–1944 is the closest. None of these was chosen before the data was seen.
 * Readings A and B scale with `floorAreaM2`; reading C is a published median and does not.
 */
export function needReferences(floorAreaM2: number): NeedReference[] {
  const perM2 = needMedianGasPerM2;
  const nationalByAge = perM2.builtFrom1919To1944 * floorAreaM2;
  return [
    {
      name: 'A: 1919–44 houses, England and Wales, per m² × floor area',
      gasKwh: nationalByAge,
      caveat: 'Corrects for size, but covers all house types and regions.',
    },
    {
      name: 'B: as A, adjusted for London and for semi-detached houses',
      gasKwh: nationalByAge * (perM2.london / perM2.allHouses) * (perM2.semiDetached / perM2.allHouses),
      caveat:
        'Multiplies one-way ratios. London has more older homes, so part of the age effect is counted twice.',
    },
    {
      name: 'C: London 3-bed semis built 1919–44, median',
      gasKwh: needLondonThreeBedSemi.medianGasKwh,
      caveat: `Closest match by type, age and region (${needLondonThreeBedSemi.sampleSize.toLocaleString('en-GB')} homes), but not corrected for size. At A's per-m² rate it implies about ${Math.round(needLondonThreeBedSemi.medianGasKwh / perM2.builtFrom1919To1944)} m².`,
    },
  ];
}

/** Gap of a modelled value from a reference, as a fraction of the reference (the spec's decision rule). */
export function gapFromReference(modelledKwh: number, referenceKwh: number): number {
  return (modelledKwh - referenceKwh) / referenceKwh;
}
