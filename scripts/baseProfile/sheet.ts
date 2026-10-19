// ABOUT: Reads Elexon's average profile class 1 table out of the unzipped spreadsheet's XML, with no spreadsheet library
// ABOUT: Expects the 2013/14 file's layout: a header row of season and day-type names, then 48 half-hour rows

import { COLUMN_NAMES, type ProfileClassData } from './derive.ts';

const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;
const HALF_HOURS = 48;
const COLUMNS = 'BCDEFGHIJKLMNOP';

/** The shared strings, in order. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/g)].map((match) => match[1]!);
}

/** Cell values by row number and column letter. Strings are resolved from the shared strings. */
function cells(sheetXml: string, strings: readonly string[]): Map<number, Map<string, string | number>> {
  const rows = new Map<number, Map<string, string | number>>();
  for (const [, rowNumber, body] of sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)) {
    const row = new Map<string, string | number>();
    for (const [, column, attributes, value] of body!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<v>(.*?)<\/v>)?<\/c>)/g)) {
      if (value === undefined) continue;
      row.set(column!, attributes!.includes('t="s"') ? strings[Number(value)]! : Number(value));
    }
    rows.set(Number(rowNumber), row);
  }
  return rows;
}

/** Profile class 1's fifteen columns. Throws if the layout is not the one expected. */
export function readProfileClass1(sheetXml: string, sharedStringsXml: string): ProfileClassData {
  const rows = cells(sheetXml, sharedStrings(sharedStringsXml));
  if (rows.get(1)?.get('A') !== 'Profile Class 1') throw new Error('Expected "Profile Class 1" in cell A1');
  const expected: readonly string[] = COLUMN_NAMES;
  const data = new Map<string, number[]>();
  for (const column of COLUMNS) {
    const name = rows.get(HEADER_ROW)?.get(column);
    if (typeof name !== 'string' || !expected.includes(name)) throw new Error(`Unexpected header in ${column}${HEADER_ROW}: ${String(name)}`);
    data.set(name, Array.from({ length: HALF_HOURS }, (_, index) => {
      const value = rows.get(FIRST_DATA_ROW + index)?.get(column);
      if (typeof value !== 'number' || !(value >= 0)) throw new Error(`Expected a demand in ${column}${FIRST_DATA_ROW + index}, got ${String(value)}`);
      return value;
    }));
  }
  if (data.size !== expected.length) throw new Error(`Expected ${expected.length} distinct columns, found ${data.size}`);
  return data;
}
