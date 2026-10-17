// ABOUT: Builds a Home Energy Model (HEM) input file for the benchmark archetype from the draft values
// ABOUT: Converts U-values to HEM's construction resistances and spreads glazing over four orientations

import { archetype, occupancy, uValues } from './draftValues.ts';

const HOURS_PER_YEAR = 8760;

// HEM's surface heat transfer coefficients (building_element.rs), in W/m²K. HEM adds the matching
// surface resistances to each element's construction resistance, so U = 1 / (R_si + R_c + R_se).
const H_RI = 5.13;
const H_CI_HORIZONTAL = 2.5;
const H_CI_UPWARDS = 5.0;
const H_CE = 20.0;
const H_RE = 4.14;
export const R_SI_HORIZONTAL = 1 / (H_RI + H_CI_HORIZONTAL);
export const R_SI_UPWARDS = 1 / (H_RI + H_CI_UPWARDS);
export const R_SE = 1 / (H_CE + H_RE);

/** Construction resistance (m²K/W) that gives `uValue` once HEM adds its surface resistances. */
export function constructionResistance(uValue: number, internalSurfaceResistance: number): number {
  return 1 / uValue - internalSurfaceResistance - R_SE;
}

export interface HemInputOptions {
  roofUValueWPerM2K: number;
  /** Air permeability at 50 Pa (m³/h per m² of envelope), chosen to give about the draft air change rate. */
  airPermeabilityQ50: number;
  /** HEM's thermostat controls operative temperature (the mean of air and surface temperatures). */
  thermostatC: number;
  latitude: number;
  longitude: number;
}

const FOOTPRINT_DEPTH_M = 7;
const FOOTPRINT_WIDTH_M = archetype.groundFloorAreaM2.value / FOOTPRINT_DEPTH_M;
const HOUSE_HEIGHT_M = archetype.storeyHeightM.value * 2;
const PARTY_WALL_AREA_M2 = FOOTPRINT_DEPTH_M * HOUSE_HEIGHT_M;

// Window g-value and frame fraction match the rough calculation's solar-gain working.
const WINDOW_G_VALUE = 0.63;
const WINDOW_FRAME_FRACTION = 0.3;

// Areal heat capacities (J/m²K) and mass classes follow the HEM demo input for masonry walls,
// a light roof and a timber floor. They matter little under continuous heating.
const MASONRY_HEAT_CAPACITY = 145_154;
const LIGHT_HEAT_CAPACITY = 18_170;
const TIMBER_FLOOR_HEAT_CAPACITY = 20_000;

const constant = <T>(value: T): HourlySchedule<T>['main'] => [{ value, repeat: HOURS_PER_YEAR }];

/** The three exposed facades: front, back and one side. Net wall area is shared by facade length. */
const facades = [
  { name: 'front', orientation360: 180, lengthM: FOOTPRINT_WIDTH_M },
  { name: 'back', orientation360: 0, lengthM: FOOTPRINT_WIDTH_M },
  { name: 'side', orientation360: 90, lengthM: FOOTPRINT_DEPTH_M },
];

/** The phase 1 engine averages solar gains over four orientations, so glazing is split equally. */
const windowOrientations = [0, 90, 180, 270];

/** The fields of a HEM building element this builder sets. HEM reads others; they are left out. */
export interface HemBuildingElement {
  type: string;
  pitch: number;
  area?: number;
  width?: number;
  height?: number;
  orientation360?: number;
  thermal_resistance_construction?: number;
  u_value?: number;
  [field: string]: unknown;
}

interface HourlySchedule<T> {
  main: { value: T; repeat: number }[];
}

interface HourlySeries {
  start_day: number;
  time_series_step: number;
  schedule: HourlySchedule<number>;
}

/** The parts of the HEM input the benchmark checks; the rest passes through to HEM unchanged. */
export interface HemInput {
  SimulationTime: { start: number; end: number; step: number };
  InternalGains: { 'metabolic gains': HourlySeries };
  Control: Record<string, HourlySeries & { type: string }>;
  Zone: {
    house: {
      area: number;
      volume: number;
      BuildingElement: Record<string, HemBuildingElement>;
      [field: string]: unknown;
    };
  };
  [section: string]: unknown;
}

export function buildHemInput(options: HemInputOptions): HemInput {
  const exposedPerimeterM = archetype.exposedPerimeterM.value;
  const netWallAreaM2 = archetype.netWallAreaM2.value;
  // The facade lengths only set each wall's share, so the walls always total the draft net wall area.
  const facadeLengthM = facades.reduce((total, facade) => total + facade.lengthM, 0);
  const windowAreaEachM2 = archetype.windowAreaM2.value / windowOrientations.length;

  const walls: Record<string, HemBuildingElement> = Object.fromEntries(
    facades.map((facade) => {
      const areaM2 = (netWallAreaM2 * facade.lengthM) / facadeLengthM;
      return [
        `wall ${facade.name}`,
        {
          type: 'BuildingElementOpaque',
          solar_absorption_coeff: 0.6,
          thermal_resistance_construction: constructionResistance(uValues.wall.value, R_SI_HORIZONTAL),
          areal_heat_capacity: MASONRY_HEAT_CAPACITY,
          mass_distribution_class: 'I',
          pitch: 90,
          orientation360: facade.orientation360,
          base_height: 0,
          height: HOUSE_HEIGHT_M,
          width: areaM2 / HOUSE_HEIGHT_M,
          area: areaM2,
        },
      ];
    }),
  );

  const windowHeightM = 1.2;
  const windows: Record<string, HemBuildingElement> = Object.fromEntries(
    windowOrientations.map((orientation360) => [
      `window ${orientation360}`,
      {
        type: 'BuildingElementTransparent',
        thermal_resistance_construction: constructionResistance(uValues.window.value, R_SI_HORIZONTAL),
        pitch: 90,
        orientation360,
        g_value: WINDOW_G_VALUE,
        frame_area_fraction: WINDOW_FRAME_FRACTION,
        base_height: 1,
        height: windowHeightM,
        width: windowAreaEachM2 / windowHeightM,
        free_area_height: 0,
        mid_height: 1.6,
        max_window_open_area: 0,
        window_part_list: [{ mid_height_air_flow_path: 1.6 }],
        shading: [],
      },
    ]),
  );

  const doorHeightM = 2;
  const footprintM2 = archetype.groundFloorAreaM2.value;

  const buildingElements: Record<string, HemBuildingElement> = {
    ...walls,
    ...windows,
    door: {
      type: 'BuildingElementOpaque',
      solar_absorption_coeff: 0.6,
      thermal_resistance_construction: constructionResistance(uValues.door.value, R_SI_HORIZONTAL),
      areal_heat_capacity: LIGHT_HEAT_CAPACITY,
      mass_distribution_class: 'I',
      pitch: 90,
      orientation360: 180,
      base_height: 0,
      height: doorHeightM,
      width: archetype.doorAreaM2.value / doorHeightM,
      area: archetype.doorAreaM2.value,
    },
    'loft ceiling': {
      type: 'BuildingElementOpaque',
      is_unheated_pitched_roof: false,
      solar_absorption_coeff: 0.6,
      thermal_resistance_construction: constructionResistance(options.roofUValueWPerM2K, R_SI_UPWARDS),
      areal_heat_capacity: LIGHT_HEAT_CAPACITY,
      mass_distribution_class: 'I',
      pitch: 0,
      orientation360: 180,
      base_height: HOUSE_HEIGHT_M,
      height: FOOTPRINT_DEPTH_M,
      width: FOOTPRINT_WIDTH_M,
      area: archetype.roofAreaM2.value,
    },
    'party wall': {
      type: 'BuildingElementPartyWall',
      thermal_resistance_construction: 0.5,
      party_wall_cavity_type: 'solid',
      areal_heat_capacity: MASONRY_HEAT_CAPACITY,
      mass_distribution_class: 'I',
      pitch: 90,
      area: PARTY_WALL_AREA_M2,
    },
    ground: {
      type: 'BuildingElementGround',
      total_area: footprintM2,
      area: footprintM2,
      pitch: 180,
      u_value: uValues.floor.value,
      thermal_resistance_floor_construction: 0.2,
      areal_heat_capacity: TIMBER_FLOOR_HEAT_CAPACITY,
      mass_distribution_class: 'I',
      floor_type: 'Suspended_floor',
      thickness_walls: 0.3,
      perimeter: exposedPerimeterM,
      psi_wall_floor_junc: 0,
      height_upper_surface: 0.5,
      thermal_transm_walls: uValues.wall.value,
      area_per_perimeter_vent: 0.0015,
      thermal_resist_insul: 0.01,
      shield_fact_location: 'Average',
    },
  };

  const envelopeAreaM2 =
    exposedPerimeterM * HOUSE_HEIGHT_M + archetype.roofAreaM2.value + footprintM2 + PARTY_WALL_AREA_M2;

  return {
    metadata: { hem_core_version: '1.0.0a7' },
    temp_internal_air_static_calcs: occupancy.meanInternalTemperatureC.value,
    SimulationTime: { start: 0, end: HOURS_PER_YEAR, step: 1 },
    ExternalConditions: {
      latitude: options.latitude,
      longitude: options.longitude,
      shading_segments: [0, 45, 90, 135, 180, 225, 270, 315].map((start) => ({
        start360: start,
        end360: start + 45,
      })),
    },
    InternalGains: {
      'metabolic gains': {
        start_day: 0,
        time_series_step: 1,
        schedule: { main: constant(occupancy.internalGainsW.value) },
      },
    },
    ApplianceGains: {},
    ColdWaterSource: {
      'mains water': { start_day: 0, time_series_step: 1, temperatures: Array(HOURS_PER_YEAR).fill(10) },
    },
    EnergySupply: { 'mains elec': { fuel: 'electricity', is_export_capable: false } },
    Control: {
      'hw min': { type: 'SetpointTimeControl', start_day: 0, time_series_step: 1, schedule: { main: constant(52) } },
      'hw max': { type: 'SetpointTimeControl', start_day: 0, time_series_step: 1, schedule: { main: constant(55) } },
      thermostat: {
        type: 'SetpointTimeControl',
        start_day: 0,
        time_series_step: 1,
        schedule: { main: constant(options.thermostatC) },
      },
    },
    // Hot water is outside this comparison. A small, well-insulated cylinder with no draw-offs
    // satisfies HEM's required inputs while adding almost no heat to the zone.
    HotWaterSource: {
      'hw cylinder': {
        type: 'StorageTank',
        volume: 80,
        daily_losses: 0.01,
        init_temp: 55,
        ColdWaterSource: 'mains water',
        HeatSource: {
          immersion: {
            type: 'ImmersionHeater',
            power: 3,
            EnergySupply: 'mains elec',
            Controlmin: 'hw min',
            Controlmax: 'hw max',
            heater_position: 0.1,
            thermostat_position: 0.33,
          },
        },
      },
    },
    HotWaterDemand: {
      Shower: {},
      Bath: {},
      Other: { other: { flowrate: 8, ColdWaterSource: 'mains water' } },
      Distribution: [],
    },
    Events: {},
    SpaceHeatSystem: {
      main: {
        type: 'InstantElecHeater',
        rated_power: 50,
        frac_convective: 0.4,
        Control: 'thermostat',
        EnergySupply: 'mains elec',
      },
    },
    InfiltrationVentilation: {
      cross_vent_possible: true,
      shield_class: 'Normal',
      terrain_class: 'Suburban',
      ventilation_zone_base_height: 0,
      altitude: 20,
      Vents: {},
      Leaks: {
        ventilation_zone_height: HOUSE_HEIGHT_M,
        test_pressure: 50,
        test_result: options.airPermeabilityQ50,
        env_area: envelopeAreaM2,
      },
    },
    Zone: {
      house: {
        SpaceHeatSystem: 'main',
        area: archetype.totalFloorAreaM2.value,
        volume: archetype.heatedVolumeM3.value,
        temp_setpnt_init: occupancy.meanInternalTemperatureC.value,
        BuildingElement: buildingElements,
        ThermalBridging: {},
      },
    },
  };
}

export interface HemRun {
  name: string;
  description: string;
  options: HemInputOptions;
}

// HEM models infiltration from an air-permeability test result. 20 m³/h·m² at 50 Pa gives the same
// static heat transfer coefficient as the draft 1.0 air change an hour; over the year HEM's
// ventilation heat balance works out at about 0.9 air changes an hour.
const AIR_PERMEABILITY_Q50 = 20;
const LONDON = { latitude: 51.507, longitude: -0.128 };

const mainOptions: HemInputOptions = {
  roofUValueWPerM2K: uValues.roof.value,
  airPermeabilityQ50: AIR_PERMEABILITY_Q50,
  thermostatC: occupancy.meanInternalTemperatureC.value,
  ...LONDON,
};

/** The pre-registered main case first, then the variant and the sensitivity runs. */
export const HEM_RUNS: [HemRun, ...HemRun[]] = [
  {
    name: 'main',
    description: 'Pre-registered main case: 100 mm loft insulation, 18 °C thermostat',
    options: mainOptions,
  },
  {
    name: 'no-loft-insulation',
    description: 'Variant: no loft insulation, 18 °C thermostat',
    options: { ...mainOptions, roofUValueWPerM2K: uValues.roofNoInsulation.value },
  },
  {
    name: 'thermostat-17',
    description: 'Sensitivity, run after the main result: 17 °C operative, which gives about 18 °C air',
    options: { ...mainOptions, thermostatC: 17 },
  },
  {
    name: 'thermostat-16',
    description: 'Sensitivity, run after the main result: 16 °C operative',
    options: { ...mainOptions, thermostatC: 16 },
  },
];

/**
 * The committed input file for a run. Number arrays (such as the hourly cold-water temperatures)
 * go on one line to keep the files short.
 */
export function hemInputFileContents(run: HemRun): string {
  const json = JSON.stringify(buildHemInput(run.options), null, 2);
  return `${json.replace(/\[[\d.,\s-]+\]/g, (array) => array.replace(/\s+/g, ''))}\n`;
}
