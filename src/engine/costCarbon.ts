// ABOUT: Annual running cost on a flat tariff and annual carbon, from kWh of gas and electricity
// ABOUT: A house with no gas supply pays no gas standing charge; every house pays the electricity standing charge

import { DAYS_PER_YEAR, PENCE_PER_POUND } from './constants.ts';
import type { EngineInputs } from './inputs.ts';

export interface AnnualFuel {
  gasKwh: number;
  electricityKwh: number;
  hasGasSupply: boolean;
}

export interface AnnualCost {
  gasUnitPounds: number;
  gasStandingPounds: number;
  electricityUnitPounds: number;
  electricityStandingPounds: number;
  totalPounds: number;
}

const pounds = (pence: number): number => pence / PENCE_PER_POUND;

export function annualCost(fuel: AnnualFuel, inputs: EngineInputs): AnnualCost {
  if (!fuel.hasGasSupply && fuel.gasKwh > 0) throw new Error('A house with no gas supply cannot use gas');
  const gasUnitPounds = pounds(fuel.gasKwh * inputs.gasUnitRatePence);
  const gasStandingPounds = fuel.hasGasSupply ? pounds(inputs.gasStandingChargePencePerDay * DAYS_PER_YEAR) : 0;
  const electricityUnitPounds = pounds(fuel.electricityKwh * inputs.electricityUnitRatePence);
  const electricityStandingPounds = pounds(inputs.electricityStandingChargePencePerDay * DAYS_PER_YEAR);
  return {
    gasUnitPounds,
    gasStandingPounds,
    electricityUnitPounds,
    electricityStandingPounds,
    totalPounds: gasUnitPounds + gasStandingPounds + electricityUnitPounds + electricityStandingPounds,
  };
}

/** Carbon in kgCO₂e: gas kWh (gross CV) × gas factor + electricity kWh × annual average grid factor. */
export function annualCarbonKg(fuel: Pick<AnnualFuel, 'gasKwh' | 'electricityKwh'>, inputs: EngineInputs): number {
  return fuel.gasKwh * inputs.gasCarbonKgPerKwh + fuel.electricityKwh * inputs.gridCarbonKgPerKwh;
}
