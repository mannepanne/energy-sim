// ABOUT: Command-line entry for benchmark step 1: prints the rough heat-demand estimate
// ABOUT: Run with `npm run benchmark:rough`; the output is pasted into scripts/benchmark/README.md

import { uValues } from './draftValues.ts';
import { roughEstimate } from './roughEstimate.ts';

const variants = [
  { label: 'Roof at RdSAP age-band default (no loft insulation)', roofU: uValues.roofAgeBandDefault.value },
  { label: 'Roof with 100 mm loft insulation', roofU: uValues.roofHundredMillimetres.value },
];

const round = (value: number, places = 0): string => value.toFixed(places);

for (const variant of variants) {
  const result = roughEstimate(variant.roofU);
  console.log(`\n## ${variant.label}\n`);
  console.log('| Element | Area (m²) | U (W/m²K) | U × A (W/K) |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const element of result.elements) {
    console.log(
      `| ${element.name} | ${round(element.areaM2, 1)} | ${round(element.uValueWPerM2K, 2)} | ${round(element.areaM2 * element.uValueWPerM2K, 1)} |`,
    );
  }
  console.log(`| Ventilation (0.33 × n × V) | | | ${round(result.heatLoss.ventilationWPerK, 1)} |`);
  console.log(`| **H** | | | **${round(result.heatLoss.totalWPerK, 0)}** |`);
  console.log('');
  console.log(`- Gains: ${round(result.gainsW)} W`);
  console.log(`- Balance point: ${round(result.balancePointC, 1)} °C`);
  console.log(`- Degree days at that base: ${round(result.degreeDays)} K·day`);
  console.log(`- **Annual space heat: ${Math.round(result.annualSpaceHeatKwh / 100) * 100} kWh**`);
}
