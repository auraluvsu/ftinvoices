import type { FiledQuarter } from '../types';

/** The filed quarter a date falls in, if any. */
export function filedQuarterFor(date: string, filed: readonly FiledQuarter[]): FiledQuarter | undefined {
  return filed.find((f) => date >= f.start && date <= f.end);
}
