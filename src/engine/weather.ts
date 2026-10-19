// ABOUT: Turns a validated PVGIS snapshot into typed hourly arrays, and precomputes what the year needs from it
// ABOUT: Prepared weather (temperature, mean vertical irradiance and the sun's path) is computed once and reused across runs

import type { PvgisSnapshot } from '../snapshots/pvgisSchema.ts';
import type { EngineInputs } from './inputs.ts';
import { meanVerticalIrradiance, sunPath, type IrradianceSeries, type SunPath } from './solar.ts';

export interface Weather extends IrradianceSeries {
  outdoorTemperatureC: Float64Array;
}

export interface PreparedWeather {
  outdoorTemperatureC: Float64Array;
  /** Irradiance on a vertical wall, averaged over north, east, south and west, W/m². */
  meanVerticalIrradiance: Float64Array;
  /** The horizontal irradiance, for irradiance on the roof, whose direction is sampled. */
  irradiance: IrradianceSeries;
  /** The sun's direction each hour, at the irradiance sample minute. */
  sunPath: SunPath;
}

export function weatherFromSnapshot(snapshot: PvgisSnapshot): Weather {
  return {
    latitudeDeg: snapshot.location.latitude,
    longitudeDeg: snapshot.location.longitude,
    outdoorTemperatureC: Float64Array.from(snapshot.hours.T2m),
    globalHorizontal: Float64Array.from(snapshot.hours['G(h)']),
    beamNormal: Float64Array.from(snapshot.hours['Gb(n)']),
    diffuseHorizontal: Float64Array.from(snapshot.hours['Gd(h)']),
  };
}

/**
 * Uses only fixed rows (sample minute and ground reflectance), so one preparation serves every sample. The roof's
 * direction is sampled, so irradiance on the roof is computed per run from the sun path prepared here.
 * `simulate` does not check that its inputs match these two values; if either row ever becomes uncertain,
 * prepare the weather per sample.
 */
export function prepareWeather(weather: Weather, inputs: Pick<EngineInputs, 'irradianceSampleMinute' | 'groundReflectance'>): PreparedWeather {
  return {
    outdoorTemperatureC: weather.outdoorTemperatureC,
    meanVerticalIrradiance: meanVerticalIrradiance(weather, inputs.irradianceSampleMinute, inputs.groundReflectance),
    irradiance: weather,
    sunPath: sunPath(weather, inputs.irradianceSampleMinute),
  };
}
