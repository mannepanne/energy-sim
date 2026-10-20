// ABOUT: Physical constants and unit conversions, the only numbers the engine holds in code
// ABOUT: Every other number comes from a register row (see REFERENCE/register.md)

/** Hours in the typical (non-leap) year the engine runs over. */
export const HOURS_PER_YEAR = 8760;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 365;
export const MONTHS_PER_YEAR = 12;
export const MINUTES_PER_HOUR = 60;

/** Volumetric heat capacity of air, in Wh per m³ per K (SAP's 0.33). */
export const AIR_HEAT_CAPACITY_WH_PER_M3K = 0.33;

/** Add to a temperature in °C to give kelvin. */
export const KELVIN_OFFSET = 273.15;

/** Specific heat of water, in kJ per kg per K, with one litre taken as one kilogram. */
export const WATER_SPECIFIC_HEAT_KJ_PER_KGK = 4.18;

export const KJ_PER_KWH = 3600;
export const WH_PER_KWH = 1000;
export const W_PER_KW = 1000;
export const PENCE_PER_POUND = 100;

export const RADIANS_PER_DEGREE = Math.PI / 180;

/** The Earth turns 15° an hour, so one degree of longitude is four minutes of solar time. */
export const DEGREES_PER_HOUR = 15;
export const MINUTES_PER_DEGREE_OF_LONGITUDE = 4;
export const SOLAR_NOON_HOUR = 12;

/** Standard test conditions for PV modules: the irradiance and cell temperature a peak power (kWp) is rated at. */
export const STC_IRRADIANCE_W_PER_M2 = 1000;
export const STC_CELL_TEMPERATURE_C = 25;
