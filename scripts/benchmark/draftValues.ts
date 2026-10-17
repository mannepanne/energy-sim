// ABOUT: Draft input values for the benchmark step 1 archetype: a 1930s semi in London
// ABOUT: Each value carries its status and a source or rationale, ahead of the real register

/**
 * Status follows the register's vocabulary:
 * - sourced: checked against the named source while writing this file;
 * - to-verify: recalled from the named source but not yet checked line by line;
 * - approximate: an engineering estimate, with the reason in `note`.
 */
export type DraftStatus = 'sourced' | 'to-verify' | 'approximate';

export interface DraftValue {
  value: number;
  unit: string;
  status: DraftStatus;
  note: string;
}

const draft = (value: number, unit: string, status: DraftStatus, note: string): DraftValue => ({
  value,
  unit,
  status,
  note,
});

const totalFloorAreaM2 = 90;
const storeyHeightM = 2.5;
const exposedPerimeterM = 20;
const storeys = 2;
const windowAreaM2 = 0.122 * totalFloorAreaM2 + 6.875;
const doorAreaM2 = 1.85;
const grossWallAreaM2 = exposedPerimeterM * storeyHeightM * storeys;

export const archetype = {
  totalFloorAreaM2: draft(
    totalFloorAreaM2,
    'm²',
    'approximate',
    'The spec archetype is "about 90 m²". Two storeys of 45 m².',
  ),
  storeyHeightM: draft(
    storeyHeightM,
    'm',
    'approximate',
    'Typical room height for the period, used for both wall height and heated volume. RdSAP adds a floor void for upper storeys; ignored here.',
  ),
  exposedPerimeterM: draft(
    exposedPerimeterM,
    'm',
    'approximate',
    'A 45 m² footprint of about 6.5 m × 7 m: front, back and one side wall. The party wall is excluded (no heat loss).',
  ),
  heatedVolumeM3: draft(
    totalFloorAreaM2 * storeyHeightM,
    'm³',
    'approximate',
    'Floor area × storey height.',
  ),
  windowAreaM2: draft(
    windowAreaM2,
    'm²',
    'to-verify',
    'RdSAP window-area formula for houses in age bands A–C: 0.122 × floor area + 6.875. Check against the RdSAP 10 table.',
  ),
  doorAreaM2: draft(doorAreaM2, 'm²', 'to-verify', 'RdSAP standard area for one external door.'),
  netWallAreaM2: draft(
    grossWallAreaM2 - windowAreaM2 - doorAreaM2,
    'm²',
    'approximate',
    'Exposed perimeter × two storey heights, less window and door area.',
  ),
  roofAreaM2: draft(totalFloorAreaM2 / storeys, 'm²', 'approximate', 'Loft floor equals the footprint.'),
  groundFloorAreaM2: draft(totalFloorAreaM2 / storeys, 'm²', 'approximate', 'Equals the footprint.'),
} as const;

export const uValues = {
  wall: draft(
    1.5,
    'W/m²K',
    'to-verify',
    'RdSAP England default for an unfilled cavity wall, age bands A–E. Check against the RdSAP 10 wall table.',
  ),
  window: draft(
    2.8,
    'W/m²K',
    'approximate',
    'Retrofitted PVC double glazing of unknown date. RdSAP gives about 3.1 before 2002 and about 2.0 after; 2.8 leans to the older stock.',
  ),
  door: draft(3.0, 'W/m²K', 'to-verify', 'RdSAP default for an external door.'),
  floor: draft(
    0.75,
    'W/m²K',
    'approximate',
    'Uninsulated suspended timber floor with perimeter ÷ area of about 0.44. RdSAP computes this with BS EN ISO 13370; the real row will store that working.',
  ),
  roofAgeBandDefault: draft(
    2.3,
    'W/m²K',
    'to-verify',
    'RdSAP default for a pitched roof in age bands A–D when loft insulation is unknown (treated as none).',
  ),
  roofHundredMillimetres: draft(
    0.4,
    'W/m²K',
    'to-verify',
    'RdSAP U-value for 100 mm of loft insulation at the joists. A common topped-up state in the real stock.',
  ),
} as const;

export const ventilation = {
  airChangesPerHour: draft(
    1.0,
    'ach',
    'approximate',
    'Older house with a suspended floor, an open or blocked chimney and some draughtproofing. SAP-style infiltration for this type is about 0.8–1.2.',
  ),
} as const;

export const occupancy = {
  meanInternalTemperatureC: draft(
    18,
    '°C',
    'approximate',
    'Whole-house mean under continuous heating, between SAP living-area (21 °C) and rest-of-house temperatures. Uncertain in the real register.',
  ),
  internalGainsW: draft(
    450,
    'W',
    'approximate',
    'SAP-style sum for about 2.5 occupants in 90 m²: metabolic, lighting, appliances, cooking and water heating, less evaporation losses.',
  ),
  solarGainsW: draft(
    250,
    'W',
    'approximate',
    'Heating-season mean: about 18 m² of glazing × g 0.63 × frame 0.7 × shading 0.77 × about 40 W/m² mean vertical irradiance.',
  ),
} as const;

export const degreeDayMethod = {
  hitchinK: draft(
    0.71,
    '1/K',
    'to-verify',
    'Hitchin (1983) spread constant for UK monthly data, as used in CIBSE TM41. Check the TM41 value.',
  ),
} as const;

/**
 * Heathrow monthly mean temperature, 1991–2020: the mean of the 30 monthly (tmax + tmin) ÷ 2 values
 * for each month in the Met Office historic station data, rounded to 0.01 °C.
 * Days are for a non-leap year.
 */
export const londonClimate = {
  source: {
    title: 'Met Office historic station data: Heathrow (London Airport)',
    url: 'https://www.metoffice.gov.uk/pub/data/weather/uk/climate/stationdata/heathrowdata.txt',
    checked: '2026-10-17',
  },
  status: 'sourced' as DraftStatus,
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
