// ABOUT: Heat supply: fuel or electricity needed to meet each hour's heat demand
// ABOUT: Gas = heat ÷ boiler seasonal efficiency; heat pump electricity = heat ÷ SPF, with unlimited capacity

/** Divides each hour's heat by a seasonal efficiency (a boiler efficiency or a heat pump SPF). */
export function fuelForHeat(heatKwh: Float64Array, efficiency: number): Float64Array {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return heatKwh.map((heat) => heat / efficiency);
}

/** Cost of one kWh of delivered heat, in pence: the unit rate divided by the seasonal efficiency. */
export function pencePerKwhOfHeat(unitRatePence: number, efficiency: number): number {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return unitRatePence / efficiency;
}
