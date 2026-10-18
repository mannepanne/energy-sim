// ABOUT: The pre-registered NEED readings T and S for each archetype, and the rule that flags an archetype
// ABOUT: Fixed from the NEED 2026 tables before any archetype was run through the engine (see README.md)

import { NEED_GAS_PER_M2, NEED_MULTIPLE_ATTRIBUTES } from '../benchmark/needReference.ts';

export { NEED_GAS_PER_M2, NEED_MULTIPLE_ATTRIBUTES };

/** The share by which central gas use may lie outside the interval between readings T and S before an archetype is flagged. */
export const FLAG_THRESHOLD = 0.25;

/**
 * Reading T: the 2024 London median gas use (kWh a year) for the archetype's NEED property type, NEED age band and
 * default bedroom count, gas present, standard electricity meter, from the multiple attributes table.
 * Reading S: the 2024 England and Wales median gas use per m² for the NEED age band (Table 4.2c, houses), times the
 * archetype's default floor area.
 */
export interface NeedReadingInputs {
  needPropertyType: string;
  needAgeBand: string;
  bedrooms: number;
  /** Number of homes behind the reading T median. */
  sampleSize: number;
  medianGasKwh: number;
  /** The Table 4.2c column used for reading S. */
  perM2AgeBand: string;
  medianGasKwhPerM2: number;
  floorAreaM2: number;
}

/** NEED 2026, 2024 rows, read on 18 October 2026. Floor areas are the archetypes' default floor areas. */
export const NEED_READING_INPUTS = {
  midTerracePre1900: {
    needPropertyType: 'Mid terrace',
    needAgeBand: 'Pre 1919',
    bedrooms: 3,
    sampleSize: 123_986,
    medianGasKwh: 12_896.56,
    perM2AgeBand: 'Pre 1919',
    medianGasKwhPerM2: 109.63,
    floorAreaM2: 87,
  },
  endTerracePre1900: {
    needPropertyType: 'End terrace',
    needAgeBand: 'Pre 1919',
    bedrooms: 3,
    sampleSize: 25_559,
    medianGasKwh: 14_747.87,
    perM2AgeBand: 'Pre 1919',
    medianGasKwhPerM2: 109.63,
    floorAreaM2: 104,
  },
  semi1930s: {
    needPropertyType: 'Semi detached',
    needAgeBand: '1919 - 1944',
    bedrooms: 3,
    sampleSize: 173_006,
    medianGasKwh: 15_433.08,
    perM2AgeBand: '1919 - 1944',
    medianGasKwhPerM2: 121.98,
    floorAreaM2: 90,
  },
  semi1950s: {
    needPropertyType: 'Semi detached',
    needAgeBand: '1945 - 1964',
    bedrooms: 3,
    sampleSize: 45_115,
    medianGasKwh: 12_873.36,
    perM2AgeBand: '1945 - 1964',
    medianGasKwhPerM2: 112.23,
    floorAreaM2: 88,
  },
  bungalow1950s: {
    needPropertyType: 'Bungalow',
    needAgeBand: '1945 - 1964',
    bedrooms: 2,
    sampleSize: 5_078,
    medianGasKwh: 12_560.75,
    perM2AgeBand: '1945 - 1964',
    medianGasKwhPerM2: 112.23,
    floorAreaM2: 73,
  },
  midTerrace1970s: {
    needPropertyType: 'Mid terrace',
    needAgeBand: '1965 - 1982',
    bedrooms: 3,
    sampleSize: 28_287,
    medianGasKwh: 9_606.66,
    perM2AgeBand: '1965 - 1982',
    medianGasKwhPerM2: 106.15,
    floorAreaM2: 80,
  },
  detached1970s: {
    needPropertyType: 'Detached',
    needAgeBand: '1965 - 1982',
    bedrooms: 4,
    sampleSize: 6_397,
    medianGasKwh: 18_515.31,
    perM2AgeBand: '1965 - 1982',
    medianGasKwhPerM2: 106.15,
    floorAreaM2: 131,
  },
  detached1980s: {
    needPropertyType: 'Detached',
    needAgeBand: '1983 - 1992',
    bedrooms: 4,
    sampleSize: 2_963,
    medianGasKwh: 16_238.55,
    perM2AgeBand: '1983 - 1992',
    medianGasKwhPerM2: 103.06,
    floorAreaM2: 134,
  },
  semi2000s: {
    needPropertyType: 'Semi detached',
    needAgeBand: '2000 - 2011',
    bedrooms: 3,
    sampleSize: 2_066,
    medianGasKwh: 10_741.16,
    perM2AgeBand: '2000 onwards',
    medianGasKwhPerM2: 74.37,
    floorAreaM2: 85,
  },
  midTerrace2010s: {
    needPropertyType: 'Mid terrace',
    needAgeBand: '2012 onwards',
    bedrooms: 3,
    sampleSize: 3_553,
    medianGasKwh: 8_734.23,
    perM2AgeBand: '2000 onwards',
    medianGasKwhPerM2: 74.37,
    floorAreaM2: 86,
  },
} as const satisfies Record<string, NeedReadingInputs>;

export type PreRegisteredArchetype = keyof typeof NEED_READING_INPUTS;

export interface NeedReadings {
  readingTKwh: number;
  readingSKwh: number;
  /** The lower and upper ends of the interval between the two readings. */
  lowKwh: number;
  highKwh: number;
}

export function needReadings(archetype: PreRegisteredArchetype): NeedReadings {
  const inputs: NeedReadingInputs = NEED_READING_INPUTS[archetype];
  const readingTKwh = inputs.medianGasKwh;
  const readingSKwh = inputs.medianGasKwhPerM2 * inputs.floorAreaM2;
  return { readingTKwh, readingSKwh, lowKwh: Math.min(readingTKwh, readingSKwh), highKwh: Math.max(readingTKwh, readingSKwh) };
}

export interface ArchetypeGap {
  /**
   * How far central gas use lies outside the interval, as a share of the nearer end: negative below the interval,
   * positive above it, and 0 inside it.
   */
  gap: number;
  flagged: boolean;
}

/** The pre-registered rule: flagged if central gas use lies more than 25% outside the interval between T and S. */
export function archetypeGap(centralGasKwh: number, readings: Pick<NeedReadings, 'lowKwh' | 'highKwh'>): ArchetypeGap {
  const gap =
    centralGasKwh < readings.lowKwh
      ? (centralGasKwh - readings.lowKwh) / readings.lowKwh
      : centralGasKwh > readings.highKwh
        ? (centralGasKwh - readings.highKwh) / readings.highKwh
        : 0;
  return { gap, flagged: Math.abs(gap) > FLAG_THRESHOLD };
}
