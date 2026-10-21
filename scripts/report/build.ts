// ABOUT: Builds the phase 2 report (reports/phase-2-v1-model.md) from the register and the PVGIS, Octopus and PVcalc snapshots
// ABOUT: Pure and clock-free: the same inputs always give byte-identical Markdown

import { centralRunningCosts, compare, runSamples, type Comparison, type SampleRun } from '../../src/engine/compare.ts';
import { PENCE_PER_POUND } from '../../src/engine/constants.ts';
import { heatLoss } from '../../src/engine/geometry.ts';
import {
  archetypeFacts,
  defaultHouse,
  REFERENCE_ARCHETYPE,
  type GlazingAnswer,
  type LoftAnswer,
  type WallAnswer,
  type WallConstruction,
} from '../../src/engine/archetypes.ts';
import { readInputs, uncertainDraws, type EngineInputs } from '../../src/engine/inputs.ts';
import { paybackSensitivity } from '../../src/engine/paybackSensitivity.ts';
import { runCombinations } from '../../src/engine/runCombinations.ts';
import type { SamplingPlan } from '../../src/engine/sampling.ts';
import { sensitivity, SENSITIVITY_PAIRS } from '../../src/engine/sensitivity.ts';
import { COMBINATIONS, forCombination, REFERENCE_COMBINATION, type Combination } from '../../src/engine/combinations.ts';
import { agileFromSnapshot, type AgileRates } from '../../src/engine/tariffs.ts';
import { prepareWeather, weatherFromSnapshot, type PreparedWeather, type Weather } from '../../src/engine/weather.ts';
import { createAccessor, type RegisterAccessor } from '../../src/register/access.ts';
import { dueDate } from '../../src/register/load.ts';
import { STATUSES, type Register } from '../../src/register/schema.ts';
import type { OctopusSnapshot } from '../../src/snapshots/octopusSchema.ts';
import type { PvgisSnapshot } from '../../src/snapshots/pvgisSchema.ts';
import { ARCHETYPE_NAMES, ARCHETYPE_PLAN, archetypeRows, archetypeTable } from '../archetypes/table.ts';
import { NEED_GAS_TARGET_KWH } from '../calibration/setpoint.ts';
import type { PvcalcSnapshot } from '../pvgis/pvcalc.ts';
import { agileLimitations, COMBINATION_NAMES, combinationsTable, controlTable, TIME_OF_USE_ASSUMPTIONS } from '../tariffs/table.ts';
import { hemSection, pvSection } from './checks.ts';
import {
  differenceTable,
  energyTable,
  metricTable,
  paybackSensitivityTable,
  paybackTable,
  scheduleTable,
  sensitivityTable,
  solarPaybackTable,
  TIME_OF_USE_NOTE,
} from './comparisons.ts';
import { exactNumber, kgCo2e, paybackYears, pence, plainValue, pounds, range, share, wholeNumber } from './format.ts';

/**
 * The method settings for the committed report. They are not house parameters, so they live here rather than in
 * the register. The 1930s semi and the well-installed scenario use 500 samples, where the share cheapest has a
 * standard error of about 2 percentage points; the archetype table uses 200, as the spec sets.
 */
export const REPORT_PLAN: SamplingPlan = { seed: 1, count: 500 };

export interface ReportPlans {
  main: SamplingPlan;
  archetypes: SamplingPlan;
}

export const REPORT_PLANS: ReportPlans = { main: REPORT_PLAN, archetypes: ARCHETYPE_PLAN };

export const REPORT_PATH = 'reports/phase-2-v1-model.md';

/** Everything the report reads, all committed files. */
export interface ReportData {
  register: Register;
  pvgis: PvgisSnapshot;
  octopus: OctopusSnapshot;
  pvcalc: PvcalcSnapshot;
}

/** The heat pump combinations, which the issue 15 bias, the schedule row and the well-installed scenario concern. */
const HEAT_PUMP_COMBINATIONS = COMBINATIONS.filter((combination) => combination.startsWith('heatPump'));

/** The 95% Monte Carlo margin on a share from `count` samples, in whole percentage points (at least 1). */
export function marginPoints(fraction: number, count: number): number {
  return Math.max(1, Math.round(1.96 * Math.sqrt((fraction * (1 - fraction)) / count) * 100));
}

/** The price period, taken from the end of the electricity unit rate row's label, so it updates with the row. */
export function pricePeriod(access: RegisterAccessor): string {
  return access.fixed('prices.electricityUnitRate').label.split(', ').at(-1)!;
}

/** The month and year of a UTC instant, such as "October 2025". */
const monthYear = (instant: string): string => new Date(instant).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const ISSUE_15_BIAS =
  '**The heat pump figures carry a stated bias in the heat pump’s favour.** The heat pump heats from 7 am to 11 pm every day and the boiler in SAP’s two periods on weekdays. On those two schedules the engine understates the heat pump’s space heat against the boiler’s by about 6.7 points, against the government’s Home Energy Model, so the heat pump’s running costs may be a little low and its savings a little high ([issue 15](https://github.com/mannepanne/energy-sim/issues/15); see the [schedules ADR](../REFERENCE/decisions/2026-10-20-heating-schedules-one-thermal-mass-node.md)). The sensitivity section shows the heat pump on the gas schedule instead.';

function atAGlance(comparison: Comparison, count: number): string {
  const reference = forCombination(comparison.bands, REFERENCE_COMBINATION);
  const heatPump = forCombination(comparison.bands, 'heatPump/cap');
  const cheapest = COMBINATIONS.reduce((best, combination) =>
    forCombination(comparison.shareCheapest, combination) > forCombination(comparison.shareCheapest, best) ? combination : best,
  );
  const cheapestShare = forCombination(comparison.shareCheapest, cheapest);
  const heatPumpPayback = forCombination(comparison.payback, 'heatPump/cap');
  return [
    '## At a glance',
    '',
    `- **Replacing the gas boiler like for like** (the reference) costs ${pounds(reference.upfrontPounds.central)} and ${pounds(reference.costPounds.central)} a year to run, central (${range(pounds(reference.costPounds.p10), pounds(reference.costPounds.p90))}).`,
    `- **A heat pump on the price cap** costs ${pounds(heatPump.upfrontPounds.central)} after the grant and ${pounds(heatPump.costPounds.central)} a year to run (${range(pounds(heatPump.costPounds.p10), pounds(heatPump.costPounds.p90))}), and emits ${kgCo2e(heatPump.carbonKg.central)} of CO₂e a year against ${kgCo2e(reference.carbonKg.central)}. It pays back within its lifetime in ${share(heatPumpPayback.sharePaysBack)} of samples (central: ${paybackYears(heatPumpPayback.central)}); in ${share(heatPumpPayback.shareDoesNotPayBack)} it doesn’t, and in ${share(heatPumpPayback.shareCheaperUpFrontCostsMoreToRun)} it is cheaper up front but costs more to run.`,
    `- **The combination most often cheapest to run** is “${COMBINATION_NAMES[cheapest]}”, in ${share(cheapestShare)} of samples (with about ±${marginPoints(cheapestShare, count)} percentage points of sampling noise). ${TIME_OF_USE_NOTE}`,
    `- ${ISSUE_15_BIAS}`,
  ].join('\n');
}

const WALL_WORDS: Record<WallConstruction, Record<WallAnswer, string>> = {
  cavity: { asBuilt: 'cavity walls as built', cavityFilled: 'filled cavity walls', solidWallInsulated: 'insulated cavity walls' },
  solidBrick: { asBuilt: 'solid brick walls as built', cavityFilled: 'filled cavity walls', solidWallInsulated: 'insulated solid brick walls' },
};
const LOFT_WORDS: Record<LoftAnswer, string> = { none: 'no loft insulation', about100mm: 'about 100 mm of loft insulation', '270mmOrMore': '270 mm or more of loft insulation' };
const GLAZING_WORDS: Record<GlazingAnswer, string> = {
  single: 'single glazing',
  olderDouble: 'double glazing installed before 2002',
  newerDouble: 'double glazing installed in 2002 or later',
};

function houseSection(access: RegisterAccessor, inputs: EngineInputs): string {
  const facts = archetypeFacts(access, inputs.house.archetype);
  const cosy = inputs.cosyUnitRatePence;
  return [
    '## The house',
    '',
    `${ARCHETYPE_NAMES[inputs.house.archetype]}, in London (RdSAP age band ${facts.ageBand}): ${plainValue(inputs.house.floorAreaM2)} m² over ${facts.storeys === 1 ? 'one storey' : `${facts.storeys} storeys`}, ${WALL_WORDS[facts.wallConstruction][inputs.house.walls]}, ${LOFT_WORDS[inputs.house.loft]} and ${GLAZING_WORDS[inputs.house.glazing]}, with ${inputs.house.occupants} occupants. Every setup on every tariff runs on this house.`,
    '',
    `- **Geometry**, derived from the floor area and the footprint shape: ${plainValue(Math.round(inputs.exposedPerimeterM * 10) / 10)} m of exposed perimeter, ${plainValue(Math.round(inputs.externalWallAreaM2))} m² of external wall and ${plainValue(Math.round(inputs.windowAreaM2 * 10) / 10)} m² of windows. The ground floor U-value is ${inputs.groundFloorUValue} W/m²K (BS EN ISO 13370, as RdSAP 10 applies it). Heat loss coefficient (central): ${wholeNumber(heatLoss(inputs).totalWPerK)} W/K.`,
    `- **Heating:** a setpoint of ${plainValue(inputs.setpointC)} °C air (central), calibrated so the gas boiler uses ${wholeNumber(NEED_GAS_TARGET_KWH)} kWh of gas a year. The boiler heats in SAP’s periods (weekdays 7–9 am and 4–11 pm, weekends 7 am to 11 pm); the heat pump from 7 am to 11 pm every day, SAP’s longer heat pump day. Between periods the house cools against its thermal mass. The heat pump’s output is capped at ${plainValue(inputs.heatPumpOutputMargin)} × its design heat loss, the boiler’s at ${wholeNumber(inputs.boilerOutputCapW / 1000)} kW.`,
    `- **Solar:** ${plainValue(Math.round(inputs.pv.peakPowerKw * 100) / 100)} kWp on one roof slope (central), facing south. Generation meets the house’s own use first; the rest is exported at ${pence(inputs.exportRatePence)} a kWh.`,
    `- **Prices:** gas is always on the Ofgem price cap for the London region, by Direct Debit, for ${pricePeriod(access)}: ${pence(inputs.gasUnitRatePence)} a kWh and ${pence(inputs.gasStandingChargePencePerDay)} a day. Electricity is on the cap (${pence(inputs.electricityUnitRatePence)} a kWh and ${pence(inputs.electricityStandingChargePencePerDay)} a day), Octopus Cosy (${pence(Math.min(...cosy))} to ${pence(Math.max(...cosy))} a kWh by time of day, ${pence(inputs.cosyStandingChargePencePerDay)} a day; heat pump homes only) or Octopus Agile (a past year’s half-hourly rates, ${pence(inputs.agileStandingChargePencePerDay)} a day). Electricity prices include VAT at ${plainValue(inputs.electricityVatRate * 100)}%. A heat pump house has no gas supply, so it pays no gas standing charge.`,
    `- **Carbon:** ${inputs.gasCarbonKgPerKwh} kgCO₂e a kWh of gas and ${inputs.gridCarbonKgPerKwh} kgCO₂e a kWh of grid electricity (annual average).`,
  ].join('\n');
}

function resultsSection(comparison: Comparison): string {
  return [
    '## Results for the 10 combinations',
    '',
    'Each setup on each electricity tariff it can use: 2 gas setups on the price cap and Agile, and 2 heat pump setups on the cap, Cosy and Agile. **Central** is the run with every row at its default; the **median** and the **10th to 90th percentile** come from the samples.',
    '',
    '### Running cost',
    '',
    metricTable(comparison, 'costPounds', 'A year', pounds),
    '',
    ISSUE_15_BIAS,
    '',
    '### Carbon',
    '',
    metricTable(comparison, 'carbonKg', 'kgCO₂e a year', kgCo2e),
    '',
    'Carbon counts imported electricity and gas only: exported solar earns no credit.',
    '',
    '### Upfront cost after the grant',
    '',
    metricTable(comparison, 'upfrontPounds', 'Upfront', pounds),
    '',
    'The heat pump setups have the £7,500 Boiler Upgrade Scheme grant taken off. The tariff doesn’t change what the kit costs.',
    '',
    '### Payback against replacing the boiler',
    '',
    paybackTable(comparison),
    '',
    '- **The horizon** is the heat pump’s lifetime for a heat pump setup (any PV value left at the end is ignored), PV’s lifetime for gas with solar, and the boiler’s for the gas boiler on Agile. The reference’s boiler is replaced whenever its lifetime ends inside the horizon, and that cost counts against the reference.',
    '- **“At once”** means the combination costs no more up front and never costs more to run. **“Cheaper up front, costs more to run”** samples have no payback year and are left out of the percentiles, which rank “doesn’t pay back” after every year and show it as “beyond lifetime”. The three shares sum to 100%.',
    '- Payback is undiscounted, at today’s rates in year 1 with each fuel’s real price change after that.',
    '',
    '### Energy, central',
    '',
    energyTable(comparison),
  ].join('\n');
}

function timeOfUseSection(inputs: EngineInputs, weather: PreparedWeather, agile: AgileRates): string {
  return [
    '## Time-of-use caveats',
    '',
    'These apply to every Cosy and Agile result in this report.',
    '',
    ...TIME_OF_USE_ASSUMPTIONS,
    ...agileLimitations(agile.window),
    '',
    controlTable(inputs, weather, agile),
    '',
    'Control raises the setpoint in cheap hours and lowers it in peak hours during heating, and fills the cylinder in cheap hours; on the price cap it changes nothing ([engine.md](../REFERENCE/engine.md#tariffs-and-control)).',
  ].join('\n');
}

function comparisonsSection(comparison: Comparison, plan: SamplingPlan): string {
  const { count } = plan;
  return [
    '## Comparisons',
    '',
    '### Paired differences against the reference',
    '',
    'Every combination runs on the same samples, so each sample compares the same house and household with different kit and tariffs. The difference is the reference (the gas boiler on the price cap) minus the combination: positive means it costs less to run, or emits less.',
    '',
    differenceTable(comparison, { cost: pounds, carbon: kgCo2e }),
    '',
    '### Which is cheapest to run',
    '',
    combinationsTable(comparison, plan),
    '',
    `“Cheapest of all” ranks all 10; “cheapest on its tariff” ranks those on the same electricity tariff (2 on Cosy, 4 on the cap and on Agile), so those shares don’t compare between tariffs. An exact tie counts as a share. With ${wholeNumber(count)} samples a share carries up to about ±${marginPoints(0.5, count)} points of sampling noise. ${TIME_OF_USE_NOTE}`,
    '',
    '### Solar’s own payback',
    '',
    'Solar against the same heating and tariff without it, over PV’s lifetime, so solar can’t hide a heat pump that doesn’t pay back.',
    '',
    solarPaybackTable(comparison),
  ].join('\n');
}

function sensitivitySection(access: RegisterAccessor, inputs: EngineInputs, weather: PreparedWeather, agile: AgileRates, run: SampleRun): string {
  const tables = sensitivity(access, weather, SENSITIVITY_PAIRS, { agile });
  const gasPence = inputs.gasUnitRatePence / inputs.boilerSeasonalEfficiency;
  const heatPumpPence = inputs.electricityUnitRatePence / inputs.heatPumpSpf;
  const auxiliaryPounds = (inputs.boilerAuxiliaryElectricityKwhPerYear * inputs.electricityUnitRatePence) / PENCE_PER_POUND;
  const scheduleCombinations: Combination[] = [REFERENCE_COMBINATION, ...HEAT_PUMP_COMBINATIONS];
  const own = runCombinations(inputs, weather, scheduleCombinations, agile);
  const onGasSchedule = runCombinations({ ...inputs, heatPumpSchedule: inputs.gasSchedule }, weather, scheduleCombinations, agile);
  return [
    '## Sensitivity',
    '',
    '### Running cost, one row at a time',
    '',
    'Each uncertain row is run at its low and then its high value, with every other row at its default, ignoring correlations. Rows are ranked by how much they move the difference (the baseline minus the option, positive when the option is cheaper to run). A table lists only the rows either combination’s running cost reads: capital costs, lifetimes and price changes are in the payback table below, the roof solar rows appear only with solar, and the control boost only on Cosy and Agile. The low and high are the ends of each row’s range, not percentiles; for the SPF they are the clip limits of its lognormal distribution, far out in its tails.',
    '',
    `On the price cap, a kWh of heat costs almost the same from either system at the central values: ${pence(gasPence)} from the boiler (${pence(inputs.gasUnitRatePence)} ÷ ${inputs.boilerSeasonalEfficiency}) and ${pence(heatPumpPence)} from the heat pump (${pence(inputs.electricityUnitRatePence)} ÷ ${inputs.heatPumpSpf}). So rows that change how much heat the house needs move both running costs but barely the difference, which turns on the SPF, the boiler efficiency and the gas standing charge the heat pump house doesn’t pay. The boiler’s pump and fan electricity (${wholeNumber(inputs.boilerAuxiliaryElectricityKwhPerYear)} kWh a year) adds about ${pounds(auxiliaryPounds)} to the gas setups’ bills.`,
    '',
    ...tables.flatMap((table) => [`#### ${COMBINATION_NAMES[table.pair.option]} against ${COMBINATION_NAMES[table.pair.against].toLowerCase()}`, '', sensitivityTable(table), '']),
    '### The heat pump on the gas schedule',
    '',
    'The heat pump schedule row is a profile, so the tables above can’t move it. Here each heat pump combination runs on the gas boiler’s schedule (SAP’s periods) instead of its own 7 am to 11 pm day, central, with everything else unchanged. The heat pump has its own day because, on the gas schedule, its capped output leaves the house colder on cold days than the field trial homes are. The difference between the two columns is the size of the schedule choice; the 6.7-point bias above is how far the engine’s one thermal-mass node shifts it.',
    '',
    scheduleTable(own, onGasSchedule, REFERENCE_COMBINATION),
    '',
    '### Payback, one row at a time',
    '',
    'Capital costs, lifetimes and the real price changes never change a year’s running cost, so the tables above leave them out. Here each is moved alone to its low and its high, with every other row at its default, and the central payback year shown at both ends. Moving one price change alone ignores its correlation with the other. Lifetimes also move the horizon and the replacements inside it. The rows are ranked by how far they move the heat pump’s payback on the price cap, counting “beyond lifetime” as the lifetime and “cheaper up front, costs more to run” as no years.',
    '',
    paybackSensitivityTable(paybackSensitivity(access, centralRunningCosts(run))),
  ].join('\n');
}

function wellInstalledSection(access: RegisterAccessor, weather: PreparedWeather, agile: AgileRates, plan: SamplingPlan, fieldTrial: Comparison): string {
  const comparison = compare(runSamples(access, weather, plan, { combinations: COMBINATIONS, agile, spfScenario: 'wellInstalled' }));
  const spf = (scenario: 'fieldTrial' | 'wellInstalled'): string => plainValue(readInputs(access, { spfScenario: scenario }).heatPumpSpf);
  const lines = HEAT_PUMP_COMBINATIONS.map((combination) => {
    const bands = forCombination(comparison.bands, combination).costPounds;
    const payback = forCombination(comparison.payback, combination);
    return [
      COMBINATION_NAMES[combination],
      pounds(forCombination(fieldTrial.bands, combination).costPounds.central),
      `${pounds(bands.central)} (${range(pounds(bands.p10), pounds(bands.p90))})`,
      pounds(forCombination(comparison.differences, combination).costPounds.central),
      share(forCombination(comparison.shareCheapest, combination)),
      `${share(payback.sharePaysBack)}, ${paybackYears(payback.median)}`,
    ].join(' | ');
  });
  return [
    '## The well-installed scenario',
    '',
    `The same samples with the heat pump’s SPF drawn from a distribution anchored on HeatpumpMonitor.org (central SPF ${spf('wellInstalled')}) instead of the Electrification of Heat field trial (central ${spf('fieldTrial')}). HeatpumpMonitor.org’s homes are self-selected: owners who monitor their systems and often tune them, so this is what a well-installed heat pump can do, not what a typical one does. It is a labelled scenario, not a fifth setup. Every other row is drawn the same, so the gas setups don’t change.`,
    '',
    '| Combination | Running cost, field trial (central) | Well installed, central (P10 to P90) | Reference minus it, central | Cheapest of all | Pays back, median |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...lines.map((line) => `| ${line} |`),
    '',
    TIME_OF_USE_NOTE,
  ].join('\n');
}

function archetypeSection(access: RegisterAccessor, weather: PreparedWeather, plan: SamplingPlan): string {
  return [
    '## The archetype table',
    '',
    archetypeTable(archetypeRows(access, weather, plan), plan).trimEnd(),
    '',
    'NEED reading T is the 2024 London median gas use for the archetype’s type, age band and bedrooms; reading S is the England and Wales per-m² median for its age band × its floor area. Both were fixed before any archetype ran. A flagged archetype stays in the table with a visible warning. The gaps are evidence on whether the calibrated setpoint absorbs fabric error ([issue 14](https://github.com/mannepanne/energy-sim/issues/14)).',
  ].join('\n');
}

function checksSection(access: RegisterAccessor, weather: Weather, pvcalc: PvcalcSnapshot): string {
  return ['## Checks against outside references', '', hemSection(weather), '', pvSection(access, weather, pvcalc)].join('\n');
}

function methodSection(access: RegisterAccessor, run: SampleRun): string {
  const uncertain = uncertainDraws(access, run.house).map((draw) => draw.label);
  // Each correlation row's label names its pair, such as "Correlation of the gas and electricity real price changes".
  const correlations = access.correlations().map((row) => `${row.label.replace(/^Correlation of /, '')} (${plainValue(row.value)})`);
  return [
    '## How the ranges are made',
    '',
    `- **Samples:** ${wholeNumber(run.plan.count)} joint samples with seed ${run.plan.seed}, shared by all 10 combinations. Each sample draws a value for every uncertain row: ${uncertain.join('; ')}. Every other number is fixed.`,
    '- **Stable draws:** each value comes from a hash of the seed, the sample number and the row id, passed through the row’s inverse distribution function. Triangular rows use their default as the mode. The SPF is lognormal and clipped to its low and high.',
    '- **Central** is the run with every row at its default. **Median** and the **10th to 90th percentile** come from the samples (linear interpolation between ranked samples).',
    '- **Fabric quality** is one shared factor on every U-value and the air change rate.',
    `- **Correlated rows:** a Gaussian copula correlates, in normal-score space, ${correlations.join('; and ')}. The other rows are drawn independently of each other.`,
    '- **Rounding:** costs to £10, energy to 100 kWh, carbon to 10 kg, shares to 5% and payback to whole years.',
  ].join('\n');
}

const CONVENTIONS = [
  '## Conventions',
  '',
  '- **Time base:** the engine steps through the PVGIS typical year in UTC hours. Schedules and tariff periods are in UK local time, converted with the UK clock-change rule applied to 2026. The typical year’s months come from different years, so its weekdays are taken from 2026: 1 January is a Thursday, and the clock changes fall on Sundays ([issue 25](https://github.com/mannepanne/energy-sim/issues/25)). Agile’s past rates are placed on the typical year by calendar date and time, with 29 February dropped.',
  '- **Carbon:** imported electricity at the annual average grid factor and gas at its combustion factor. Exported solar electricity earns no carbon credit ([issue 34](https://github.com/mannepanne/energy-sim/issues/34)).',
  '- **Payback is undiscounted,** in today’s money with a real price change for each fuel ([issue 37](https://github.com/mannepanne/energy-sim/issues/37)).',
  '- **The boiler needs replacing now.** Every setup is compared with replacing it like for like, so a heat pump only has to recover its extra cost over a new boiler. A home with years left in its boiler would see later payback ([issue 37](https://github.com/mannepanne/energy-sim/issues/37)).',
  '- **The grant and MCS:** the £7,500 Boiler Upgrade Scheme grant applies to the heat pump’s first installation only, and the heat pump and PV are assumed MCS-certified, which the grant and export payments need. The PV inverter is not replaced within PV’s lifetime ([issue 39](https://github.com/mannepanne/energy-sim/issues/39)).',
].join('\n');

/** The base electricity profile's source title, from its register row. */
function baseProfileSource(register: Register): string {
  const row = register.rows.find((candidate) => candidate.id === 'electricity.baseProfileWeekly');
  if (row?.source === undefined) throw new Error('The register has no sourced base electricity profile row');
  return `${row.source.title}, checked on ${row.lastChecked}`;
}

function dataDatesSection({ register, pvgis, octopus, pvcalc }: ReportData): string {
  const statusCounts = STATUSES.map((status) => `${register.rows.filter((row) => row.status === status).length} ${status}`).join(', ');
  const checked = register.rows.map((row) => row.lastChecked).toSorted();
  const due = register.rows
    .flatMap((row) => {
      const by = dueDate(row);
      return by === undefined ? [] : [{ id: row.id, lastChecked: row.lastChecked, by }];
    })
    .toSorted((a, b) => (a.by === b.by ? (a.id < b.id ? -1 : 1) : a.by < b.by ? -1 : 1));
  const lastAgileMonth = new Date(Date.parse(octopus.agile.windowEnd) - 1).toISOString();
  return [
    '## Data dates',
    '',
    `- **Register:** ${register.rows.length} rows (${statusCounts}), last checked between ${checked[0]} and ${checked[checked.length - 1]}. A sourced row has been checked against its source; a to-verify row is taken from a source but not yet checked line by line; an approximate row is an estimate with a written reason. See [register.md](../REFERENCE/register.md).`,
    `- **Weather:** the PVGIS typical year for ${exactNumber(pvgis.location.latitude)}, ${exactNumber(pvgis.location.longitude)} (${pvgis.radiationDatabase}), fetched on ${pvgis.fetchedOn}. ${pvgis.attribution}`,
    `- **Octopus tariffs:** fetched on ${octopus.fetchedOn}; Agile’s rates from ${monthYear(octopus.agile.windowStart)} to ${monthYear(lastAgileMonth)}. ${octopus.attribution}`,
    `- **The PV check:** PVGIS PVcalc, fetched on ${pvcalc.fetchedOn}.`,
    `- **Base electricity by hour:** ${baseProfileSource(register)}.`,
    '- **Rows due for a fresh check** (the rest are static). A price row falls due when its price period ends:',
    '',
    '| Row | Last checked | Due by |',
    '| --- | --- | --- |',
    ...due.map((row) => `| \`${row.id}\` | ${row.lastChecked} | ${row.by} |`),
  ].join('\n');
}

const LIMITATIONS = [
  '## Limitations',
  '',
  '- **One calibrated setpoint applies to every setup.** It comes from gas-heated homes. The heat pump’s longer day comes from SAP, not field data, and on the two schedules the engine understates the heat pump’s space heat by about 6.7 points against the boiler’s ([issue 15](https://github.com/mannepanne/energy-sim/issues/15)). The setpoint may also absorb errors in the default U-values ([issue 14](https://github.com/mannepanne/energy-sim/issues/14)).',
  '- **One thermal-mass node** holds the air and the fabric at one temperature. Against HEM it is 4.3% high on SAP’s periods, 2.4% low on the heat pump’s day and 8.4% low when heated in every hour.',
  '- **The heat pump’s hourly COP follows a curve scaled to the sampled SPF** on the price cap and the gas schedule; its own schedule and control then change its efficiency through the curve. Its output cap is a simple limit, not a sizing method, and it has no backup heater. Its standby is a share of its electricity, so small houses get less of it.',
  '- **Time-of-use results assume a smart controller** and value none of the extra warmth control buys; Agile is one past year on typical weather (see the time-of-use caveats).',
  '- **One typical weather year and one location** ([issue 16](https://github.com/mannepanne/energy-sim/issues/16)), and an **annual average grid carbon factor** ([issue 17](https://github.com/mannepanne/energy-sim/issues/17)).',
  '- **Geometry and fabric are estimates by age band:** window areas use the RdSAP 2012 formula ([issue 26](https://github.com/mannepanne/energy-sim/issues/26)), the air change rate is an estimate by age band ([issue 27](https://github.com/mannepanne/energy-sim/issues/27)), and the derived geometry has not been checked against an MCS heat loss calculation ([issue 24](https://github.com/mannepanne/energy-sim/issues/24)).',
  '- **Only two pairs of rows are correlated:** the per-occupant gains and hot water terms, and the gas and electricity price changes. Both coefficients are estimates. Every other uncertain row is drawn independently.',
  '- **Constant internal gains**, and windows split equally over four orientations.',
  '- **Not validated against real homes yet.** The site launches as a beta; volunteer homes and expert review follow.',
].join('\n');

/** The whole report, ending in a single newline. */
export function buildReport(data: ReportData, plans: ReportPlans = REPORT_PLANS): string {
  const access = createAccessor(data.register);
  const house = defaultHouse(access, REFERENCE_ARCHETYPE);
  const inputs = readInputs(access, { house });
  const rawWeather = weatherFromSnapshot(data.pvgis);
  const weather = prepareWeather(rawWeather, inputs);
  const agile = agileFromSnapshot(data.octopus);
  const run = runSamples(access, weather, plans.main, { combinations: COMBINATIONS, agile });
  const comparison = compare(run);
  const sections = [
    [
      '# Phase 2 report: the v1 model',
      '',
      '*Generated by `npm run report` from `data/register.json` and the committed PVGIS, Octopus and PVcalc snapshots. Do not edit by hand.*',
      '',
      'This report compares replacing a gas boiler with a new one, or with an air source heat pump, each with or without roof solar, on the price cap and on two Octopus time-of-use tariffs, for a 1930s semi in London, with honest ranges. It then runs the gas boiler and the heat pump on all ten house types. The numbers are estimates for a typical house of each kind, not advice for any particular home, and not financial advice.',
    ].join('\n'),
    atAGlance(comparison, plans.main.count),
    houseSection(access, inputs),
    resultsSection(comparison),
    timeOfUseSection(inputs, weather, agile),
    comparisonsSection(comparison, plans.main),
    sensitivitySection(access, inputs, weather, agile, run),
    wellInstalledSection(access, weather, agile, plans.main, comparison),
    archetypeSection(access, weather, plans.archetypes),
    checksSection(access, rawWeather, data.pvcalc),
    methodSection(access, run),
    CONVENTIONS,
    dataDatesSection(data),
    LIMITATIONS,
  ];
  return `${sections.join('\n\n')}\n`;
}
