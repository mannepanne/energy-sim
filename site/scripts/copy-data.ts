// ABOUT: Copies the register and the PVGIS weather snapshot into public/data before the site builds
// ABOUT: The copies are build output and stay out of git; data/ is the one committed source

import { copyFileSync, mkdirSync } from 'node:fs';

const target = new URL('../public/data/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const [from, to] of [
  ['../../data/register.json', 'register.json'],
  ['../../data/snapshots/pvgis-tmy-london.json', 'pvgis-tmy-london.json'],
] as const) {
  copyFileSync(new URL(from, import.meta.url), new URL(to, target));
}
