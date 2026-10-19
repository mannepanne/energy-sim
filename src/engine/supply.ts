// ABOUT: Heat supply: gas for each hour's heat, and the boiler's pump and fan electricity spread over its firing hours
// ABOUT: Gas = heat ÷ boiler seasonal efficiency, with unlimited capacity; the heat pump's electricity is in heatPump.ts

/** Divides each hour's heat by a seasonal efficiency. */
export function fuelForHeat(heatKwh: Float64Array, efficiency: number): Float64Array {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return heatKwh.map((heat) => heat / efficiency);
}

/**
 * Cost of one kWh of delivered heat, in pence: the unit rate divided by the seasonal efficiency.
 * Not used by `simulate`; it holds the spec's worked price check (costCarbon.test.ts).
 */
export function pencePerKwhOfHeat(unitRatePence: number, efficiency: number): number {
  if (!(efficiency > 0)) throw new Error(`A seasonal efficiency must be positive, got ${efficiency}`);
  return unitRatePence / efficiency;
}

/** The boiler's annual pump and fan electricity, spread over the year in proportion to each hour's gas use. */
export function auxiliaryElectricity(gasKwh: Float64Array, kwhPerYear: number): Float64Array {
  if (!(kwhPerYear >= 0)) throw new Error(`Auxiliary electricity must not be negative, got ${kwhPerYear} kWh a year`);
  const totalGas = gasKwh.reduce((total, value) => total + value, 0);
  if (totalGas === 0) return new Float64Array(gasKwh.length);
  return gasKwh.map((gas) => (gas / totalGas) * kwhPerYear);
}
