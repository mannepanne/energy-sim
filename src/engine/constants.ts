// ABOUT: Physical constants and unit conversions, the only numbers the engine holds in code
// ABOUT: Every other number comes from a register row (see REFERENCE/register.md)

/** Hours in the typical (non-leap) year the engine runs over. */
export const HOURS_PER_YEAR = 8760;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 365;
export const MINUTES_PER_HOUR = 60;

/** Volumetric heat capacity of air, in Wh per m³ per K (SAP's 0.33). */
export const AIR_HEAT_CAPACITY_WH_PER_M3K = 0.33;

/** Specific heat of water, in kJ per kg per K, with one litre taken as one kilogram. */
export const WATER_SPECIFIC_HEAT_KJ_PER_KGK = 4.18;

export const KJ_PER_KWH = 3600;
export const WH_PER_KWH = 1000;
export const PENCE_PER_POUND = 100;

export const RADIANS_PER_DEGREE = Math.PI / 180;
