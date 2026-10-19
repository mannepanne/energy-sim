// ABOUT: Prints the base electricity profile rows from Elexon's average profiling data (profile class 1)
// ABOUT: Run with `npm run derive:base-profile -- <folder>`, where the folder holds the unzipped .xlsx; copy the output into the register

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveBaseProfile } from './baseProfile/derive.ts';
import { readProfileClass1 } from './baseProfile/sheet.ts';

const folder = process.argv[2];
if (!folder) throw new Error('Pass the folder holding the unzipped spreadsheet (it contains xl/worksheets/sheet1.xml)');
const data = readProfileClass1(
  readFileSync(join(folder, 'xl', 'worksheets', 'sheet1.xml'), 'utf8'),
  readFileSync(join(folder, 'xl', 'sharedStrings.xml'), 'utf8'),
);
const profile = deriveBaseProfile(data);
console.log(`hour-of-week (electricity.baseProfileWeekly):\n${JSON.stringify(profile.hourOfWeek)}`);
console.log(`month (electricity.baseProfileMonthly):\n${JSON.stringify(profile.month)}`);
