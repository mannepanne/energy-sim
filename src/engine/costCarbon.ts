// ABOUT: Annual running cost, net of export income, and annual carbon, from kWh of gas and electricity
// ABOUT: Gas is always on the price cap; electricity is on the cap unless the caller passes another tariff's charges

import { DAYS_PER_YEAR, PENCE_PER_POUND } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

export interface AnnualFuel {
  gasKwh: number;
  /** Imported electricity. */
  electricityKwh: number;
  /** Exported electricity, paid at the export rate. Zero without solar. */
  exportKwh: number;
  hasGasSupply: boolean;
}

export interface AnnualCost {
  gasUnitPounds: number;
  gasStandingPounds: number;
  electricityUnitPounds: number;
  electricityStandingPounds: number;
  /** Income from export, which the totals subtract. */
  exportPounds: number;
  /** Gas unit and standing charges. A price change for gas scales this part. */
  gasPounds: number;
  /** Electricity unit and standing charges less export income. A price change for electricity scales this part. */
  electricityPounds: number;
  /** Gas plus electricity, net of export income. */
  totalPounds: number;
}

const pounds = (pence: number): number => pence / PENCE_PER_POUND;

/** What a year's imported electricity costs on a tariff, before the standing charge is added. */
export interface ElectricityCharges {
  /** The year's imports, each hour at that hour's rate, in pence. */
  unitPence: number;
  standingChargePencePerDay: number;
}

/** Electricity on the price cap: the year's imports at its flat unit rate. */
export const capCharges = (electricityKwh: number, inputs: EngineInputs): ElectricityCharges => ({
  unitPence: electricityKwh * inputs.electricityUnitRatePence,
  standingChargePencePerDay: inputs.electricityStandingChargePencePerDay,
});

/** A house with no gas supply pays no gas standing charge; every house pays its electricity tariff's standing charge. */
export function annualCost(fuel: AnnualFuel, inputs: EngineInputs, electricity: ElectricityCharges = capCharges(fuel.electricityKwh, inputs)): AnnualCost {
  if (!fuel.hasGasSupply && fuel.gasKwh > 0) throw new Error('A house with no gas supply cannot use gas');
  const gasUnitPounds = pounds(fuel.gasKwh * inputs.gasUnitRatePence);
  const gasStandingPounds = fuel.hasGasSupply ? pounds(inputs.gasStandingChargePencePerDay * DAYS_PER_YEAR) : 0;
  const electricityUnitPounds = pounds(electricity.unitPence);
  const electricityStandingPounds = pounds(electricity.standingChargePencePerDay * DAYS_PER_YEAR);
  const exportPounds = pounds(fuel.exportKwh * inputs.exportRatePence);
  const gasPounds = gasUnitPounds + gasStandingPounds;
  const electricityPounds = electricityUnitPounds + electricityStandingPounds - exportPounds;
  return {
    gasUnitPounds,
    gasStandingPounds,
    electricityUnitPounds,
    electricityStandingPounds,
    exportPounds,
    gasPounds,
    electricityPounds,
    totalPounds: gasPounds + electricityPounds,
  };
}

/** Carbon in kgCO₂e: gas kWh (gross CV) × gas factor + electricity kWh × annual average grid factor. */
export function annualCarbonKg(fuel: Pick<AnnualFuel, 'gasKwh' | 'electricityKwh'>, inputs: EngineInputs): number {
  return fuel.gasKwh * inputs.gasCarbonKgPerKwh + fuel.electricityKwh * inputs.gridCarbonKgPerKwh;
}
