// ABOUT: Reads every number the engine uses from the register, through the typed accessor
// ABOUT: Uncertain rows give their default unless an override is passed (the hook for sampling)

import type { RegisterAccessor } from '../register/access.ts';
import { ROW_IDS, type RowId } from '../register/ids.ts';

/** The main case has 100 mm of loft insulation; the variant has none (RdSAP's default for the age band). */
export type HouseVariant = 'main' | 'noLoftInsulation';

/** Values for uncertain rows, by row id, that replace the rows' defaults. */
export type UncertainOverrides = Partial<Record<RowId, number>>;

export interface EngineInputs {
  outdoorTemperatureOffsetK: number;
  irradianceSampleMinute: number;

  heatedVolumeM3: number;
  externalWallAreaM2: number;
  windowAreaM2: number;
  doorAreaM2: number;
  roofAreaM2: number;
  groundFloorAreaM2: number;

  wallUValue: number;
  windowUValue: number;
  doorUValue: number;
  roofUValue: number;
  groundFloorUValue: number;
  airChangesPerHour: number;
  fabricQualityFactor: number;

  internalGainsW: number;
  windowGValue: number;
  windowFrameFactor: number;
  solarAccessFactor: number;
  groundReflectance: number;

  meanInternalTemperatureC: number;
  boilerSeasonalEfficiency: number;
  heatPumpSpf: number;

  hotWaterLitresPerDay: number;
  hotWaterDeliveryTemperatureC: number;
  coldFeedTemperatureC: number;
  cylinderStandingLossKwhPerDay: number;

  electricityUnitRatePence: number;
  electricityStandingChargePencePerDay: number;
  gasUnitRatePence: number;
  gasStandingChargePencePerDay: number;

  gasCarbonKgPerKwh: number;
  gridCarbonKgPerKwh: number;

  baseElectricityKwhPerYear: number;
}

export interface ReadInputsOptions {
  variant?: HouseVariant;
  overrides?: UncertainOverrides;
}

/** Reads the engine's inputs from the register. Throws, naming the id, if a row is missing or of the wrong kind. */
export function readInputs(access: RegisterAccessor, options: ReadInputsOptions = {}): EngineInputs {
  const { variant = 'main', overrides = {} } = options;
  // Only uncertain rows take overrides; this throws for a fixed or missing id rather than ignoring it.
  for (const id of ROW_IDS) if (overrides[id] !== undefined) access.uncertain(id);
  const fixed = (id: RowId): number => access.fixed(id).value;
  const uncertain = (id: RowId): number => {
    const row = access.uncertain(id);
    return overrides[id] ?? row.default;
  };

  return {
    outdoorTemperatureOffsetK: fixed('weather.outdoorTemperatureOffset'),
    irradianceSampleMinute: fixed('weather.irradianceSampleMinute'),

    heatedVolumeM3: fixed('geometry.heatedVolume'),
    externalWallAreaM2: fixed('geometry.externalWallArea'),
    windowAreaM2: fixed('geometry.windowArea'),
    doorAreaM2: fixed('geometry.doorArea'),
    roofAreaM2: fixed('geometry.roofArea'),
    groundFloorAreaM2: fixed('geometry.groundFloorArea'),

    wallUValue: fixed('fabric.wallUValue'),
    windowUValue: fixed('fabric.windowUValue'),
    doorUValue: fixed('fabric.doorUValue'),
    roofUValue: fixed(variant === 'main' ? 'fabric.roofUValue' : 'fabric.roofUValueNoLoftInsulation'),
    groundFloorUValue: fixed('fabric.groundFloorUValue'),
    airChangesPerHour: fixed('fabric.airChangeRate'),
    fabricQualityFactor: uncertain('fabric.qualityFactor'),

    internalGainsW: uncertain('gains.internalGains'),
    windowGValue: fixed('gains.windowGValue'),
    windowFrameFactor: fixed('gains.windowFrameFactor'),
    solarAccessFactor: fixed('gains.solarAccessFactor'),
    groundReflectance: fixed('gains.groundReflectance'),

    meanInternalTemperatureC: uncertain('heating.meanInternalTemperature'),
    boilerSeasonalEfficiency: uncertain('heating.boilerSeasonalEfficiency'),
    heatPumpSpf: uncertain('heating.heatPumpSpf'),

    hotWaterLitresPerDay: uncertain('hotWater.litresPerDay'),
    hotWaterDeliveryTemperatureC: fixed('hotWater.deliveryTemperature'),
    coldFeedTemperatureC: fixed('hotWater.coldFeedTemperature'),
    cylinderStandingLossKwhPerDay: fixed('hotWater.cylinderStandingLoss'),

    electricityUnitRatePence: fixed('prices.electricityUnitRate'),
    electricityStandingChargePencePerDay: fixed('prices.electricityStandingCharge'),
    gasUnitRatePence: fixed('prices.gasUnitRate'),
    gasStandingChargePencePerDay: fixed('prices.gasStandingCharge'),

    gasCarbonKgPerKwh: fixed('carbon.gasFactor'),
    gridCarbonKgPerKwh: fixed('carbon.gridElectricityFactor'),

    baseElectricityKwhPerYear: uncertain('electricity.baseUse'),
  };
}
