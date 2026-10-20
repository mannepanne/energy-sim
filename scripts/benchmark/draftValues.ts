// ABOUT: Draft input values for the benchmark step 1 archetype: a 1930s semi in London
// ABOUT: Each value carries a register-style status with a source or a rationale

/**
 * Provenance follows the register's rules:
 * - sourced: checked against `source` while writing this file;
 * - to-verify: taken from `source` but not yet checked line by line;
 * - approximate: an engineering estimate, explained in `rationale` (a source is optional).
 */
export interface DraftSource {
  title: string;
  url: string;
}

export type DraftValue = {
  value: number;
  unit: string;
} & (
  | { status: 'sourced' | 'to-verify'; source: DraftSource; rationale?: string }
  | { status: 'approximate'; rationale: string; source?: DraftSource }
);

export type DraftStatus = DraftValue['status'];

const RDSAP_10: DraftSource = {
  title: 'RdSAP 10 specification (BRE, June 2025)',
  url: 'https://bregroup.com/documents/d/bre-group/rdsap-10-specification-10-06-2025',
};

const CIBSE_TM41: DraftSource = {
  title: 'CIBSE TM41: Degree days: theory and application (2006)',
  url: 'https://www.cibse.org/knowledge-research/knowledge-portal/technical-memorandum-41-degree-days-theory-and-application-2006-pdf/',
};

const approximate = (value: number, unit: string, rationale: string): DraftValue => ({
  value,
  unit,
  status: 'approximate',
  rationale,
});

const toVerify = (value: number, unit: string, source: DraftSource, rationale: string): DraftValue => ({
  value,
  unit,
  status: 'to-verify',
  source,
  rationale,
});

const totalFloorAreaM2 = 90;
const storeyHeightM = 2.5;
const exposedPerimeterM = 20;
const storeys = 2;
const windowAreaM2 = 0.122 * totalFloorAreaM2 + 6.875;
const doorAreaM2 = 1.85;
const grossWallAreaM2 = exposedPerimeterM * storeyHeightM * storeys;

export const archetype = {
  totalFloorAreaM2: approximate(totalFloorAreaM2, 'm²', 'The spec archetype is "about 90 m²". Two storeys of 45 m².'),
  storeyHeightM: approximate(
    storeyHeightM,
    'm',
    'Typical room height for the period, used for both wall height and heated volume. RdSAP adds a floor void for upper storeys; ignored here.',
  ),
  exposedPerimeterM: approximate(
    exposedPerimeterM,
    'm',
    'A 45 m² footprint of about 6.5 m × 7 m: front, back and one side wall. The party wall is excluded (no heat loss).',
  ),
  heatedVolumeM3: approximate(totalFloorAreaM2 * storeyHeightM, 'm³', 'Floor area × storey height.'),
  windowAreaM2: toVerify(
    windowAreaM2,
    'm²',
    RDSAP_10,
    'RdSAP window-area formula for houses in age bands A–C: 0.122 × floor area + 6.875.',
  ),
  doorAreaM2: toVerify(doorAreaM2, 'm²', RDSAP_10, 'RdSAP standard area for one external door.'),
  netWallAreaM2: approximate(
    grossWallAreaM2 - windowAreaM2 - doorAreaM2,
    'm²',
    'Exposed perimeter × two storey heights, less window and door area.',
  ),
  roofAreaM2: approximate(totalFloorAreaM2 / storeys, 'm²', 'Loft floor equals the footprint.'),
  groundFloorAreaM2: approximate(totalFloorAreaM2 / storeys, 'm²', 'Equals the footprint.'),
} satisfies Record<string, DraftValue>;

export const uValues = {
  wall: toVerify(1.5, 'W/m²K', RDSAP_10, 'England default for an unfilled cavity wall, age bands A–E.'),
  window: approximate(
    2.8,
    'W/m²K',
    'Retrofitted PVC double glazing of unknown date. RdSAP gives about 3.1 before 2002 and about 2.0 after; 2.8 leans to the older stock.',
  ),
  door: toVerify(3.0, 'W/m²K', RDSAP_10, 'Default for an external door.'),
  floor: approximate(
    0.75,
    'W/m²K',
    'Uninsulated suspended timber floor with perimeter ÷ area of about 0.44. RdSAP computes this with BS EN ISO 13370; the real row will store that working.',
  ),
  roof: toVerify(
    0.4,
    'W/m²K',
    RDSAP_10,
    'Main case: 100 mm of loft insulation at the joists. Most 1930s semis have had some loft insulation added.',
  ),
  roofNoInsulation: toVerify(
    2.3,
    'W/m²K',
    RDSAP_10,
    'Variant: the default for a pitched roof in age bands A–D when loft insulation is unknown (treated as none).',
  ),
} satisfies Record<string, DraftValue>;

export const ventilation = {
  airChangesPerHour: approximate(
    1.0,
    'ach',
    'Older house with a suspended floor, an open or blocked chimney and some draughtproofing. SAP-style infiltration for this type is about 0.8–1.2.',
  ),
} satisfies Record<string, DraftValue>;

export const occupancy = {
  meanInternalTemperatureC: approximate(
    18,
    '°C',
    'Whole-house mean under continuous heating, between SAP living-area (21 °C) and rest-of-house temperatures. Uncertain in the real register.',
  ),
  internalGainsW: approximate(
    450,
    'W',
    'SAP-style sum for about 2.5 occupants in 90 m²: metabolic, lighting, appliances, cooking and water heating, less evaporation losses.',
  ),
  solarGainsW: approximate(
    250,
    'W',
    'Heating-season mean: about 18 m² of glazing × g 0.63 × frame 0.7 × shading 0.77 × about 40 W/m² mean vertical irradiance.',
  ),
} satisfies Record<string, DraftValue>;

export const thermalMass = {
  parameterKjPerM2K: {
    value: 250,
    unit: 'kJ/m²K',
    status: 'sourced',
    source: RDSAP_10,
    rationale:
      'RdSAP 10 Table 22: 250 kJ/m²K for masonry (stone, solid brick, cavity or system built) without internal insulation. Used for the phase 2 scheduled check.',
  },
} satisfies Record<string, DraftValue>;

export const degreeDayMethod = {
  hitchinK: toVerify(0.71, '1/K', CIBSE_TM41, 'Hitchin (1983) spread constant for UK monthly data.'),
} satisfies Record<string, DraftValue>;

/**
 * Heathrow monthly mean temperature, 1991–2020: the mean of the 30 monthly (tmax + tmin) ÷ 2 values
 * for each month in the Met Office historic station data, rounded to 0.01 °C.
 * Days are for a non-leap year.
 */
export const londonClimate = {
  status: 'sourced' satisfies DraftStatus,
  source: {
    title: 'Met Office historic station data: Heathrow (London Airport), downloaded 2026-10-17',
    url: 'https://www.metoffice.gov.uk/pub/data/weather/uk/climate/stationdata/heathrowdata.txt',
  } satisfies DraftSource,
  months: [
    { meanTemperatureC: 5.55, days: 31 },
    { meanTemperatureC: 5.82, days: 28 },
    { meanTemperatureC: 7.94, days: 31 },
    { meanTemperatureC: 10.53, days: 30 },
    { meanTemperatureC: 13.74, days: 31 },
    { meanTemperatureC: 16.8, days: 30 },
    { meanTemperatureC: 19.03, days: 31 },
    { meanTemperatureC: 18.73, days: 31 },
    { meanTemperatureC: 15.92, days: 30 },
    { meanTemperatureC: 12.3, days: 31 },
    { meanTemperatureC: 8.37, days: 30 },
    { meanTemperatureC: 5.95, days: 31 },
  ],
};
