import type { Receipt } from '../types';
import { LOCALE } from './format';

/**
 * HMRC VAT quarters come in three staggers. The number is the month offset of
 * the quarter start from a calendar quarter:
 *   0 → quarters end Mar / Jun / Sep / Dec (calendar quarters)
 *   1 → quarters end Apr / Jul / Oct / Jan
 *   2 → quarters end May / Aug / Nov / Feb
 */
export type QuarterStagger = 0 | 1 | 2;

export const STAGGER_OPTIONS: { value: QuarterStagger; label: string }[] = [
  { value: 0, label: 'Mar, Jun, Sep, Dec (calendar)' },
  { value: 1, label: 'Apr, Jul, Oct, Jan' },
  { value: 2, label: 'May, Aug, Nov, Feb' },
];

export interface QuarterMonth {
  key: string; // YYYY-MM
  receipts: Receipt[];
}

export interface QuarterGroup {
  /** Absolute month index (year * 12 + month0) of the quarter's first month. */
  start: number;
  label: string;
  range: string;
  /** Always three entries, including months with no receipts. */
  months: QuarterMonth[];
  receipts: Receipt[];
}

const toAbs = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const absToKey = (abs: number) => `${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`;
const monthName = (abs: number, withYear: boolean) =>
  new Date(Math.floor(abs / 12), abs % 12, 1).toLocaleDateString(LOCALE, {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });

export function quarterStart(iso: string, stagger: QuarterStagger): number {
  const abs = toAbs(iso);
  return abs - ((((abs % 12) - stagger) % 3) + 3) % 3;
}

function describe(start: number, stagger: QuarterStagger) {
  const end = start + 2;
  const sameYear = Math.floor(start / 12) === Math.floor(end / 12);
  const range = sameYear
    ? `${monthName(start, false)} – ${monthName(end, true)}`
    : `${monthName(start, true)} – ${monthName(end, true)}`;
  const label = stagger === 0 ? `Q${Math.floor((start % 12) / 3) + 1} ${Math.floor(start / 12)}` : range;
  return { label, range };
}

/** Group receipts into VAT quarters, newest first. */
export function groupByQuarter(receipts: Receipt[], stagger: QuarterStagger): QuarterGroup[] {
  const map = new Map<number, Receipt[]>();
  for (const r of receipts) {
    const s = quarterStart(r.date, stagger);
    const list = map.get(s);
    if (list) list.push(r);
    else map.set(s, [r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b - a)
    .map(([start, list]) => ({
      start,
      ...describe(start, stagger),
      receipts: list,
      months: [0, 1, 2].map((i) => {
        const key = absToKey(start + i);
        return { key, receipts: list.filter((r) => r.date.startsWith(key)) };
      }),
    }));
}

export interface CategoryTotal {
  category: string;
  count: number;
  total: number;
  vat: number;
}

export function categoryBreakdown(receipts: Receipt[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const r of receipts) {
    const c = map.get(r.category) ?? { category: r.category, count: 0, total: 0, vat: 0 };
    c.count++;
    c.total += r.total;
    c.vat += r.vat;
    map.set(r.category, c);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Two-line axis label: ["Q1", "2026"] for calendar quarters, ["Nov–Jan", "2026"] otherwise. */
export function axisLabel(start: number, stagger: QuarterStagger): [string, string] {
  const endYear = String(Math.floor((start + 2) / 12));
  if (stagger === 0) return [`Q${Math.floor((start % 12) / 3) + 1}`, endYear];
  return [`${monthName(start, false)}–${monthName(start + 2, false)}`, endYear];
}

export interface QuarterPoint {
  start: number;
  label: string;
  range: string;
  receipts: Receipt[];
}

/** The last `count` quarters up to and including the one containing `todayIso`, oldest first, empty ones included. */
export function recentQuarters(
  receipts: Receipt[],
  stagger: QuarterStagger,
  todayIso: string,
  count = 8,
): QuarterPoint[] {
  const current = quarterStart(todayIso, stagger);
  const byStart = new Map(groupByQuarter(receipts, stagger).map((q) => [q.start, q.receipts]));
  return Array.from({ length: count }, (_, i) => {
    const start = current - (count - 1 - i) * 3;
    return { start, ...describe(start, stagger), receipts: byStart.get(start) ?? [] };
  });
}

/** A quarter with no receipts (e.g. one that only has income). */
export function emptyQuarter(start: number, stagger: QuarterStagger): QuarterGroup {
  return { start, ...describe(start, stagger), receipts: [], months: [0, 1, 2].map((i) => ({ key: absToKey(start + i), receipts: [] })) };
}

/** First and last day of the quarter starting at absolute month `start`, as YYYY-MM-DD. */
export function quarterPeriod(start: number): { from: string; to: string } {
  const end = start + 2;
  const lastDay = new Date(Math.floor(end / 12), (end % 12) + 1, 0).getDate();
  return { from: `${absToKey(start)}-01`, to: `${absToKey(end)}-${String(lastDay).padStart(2, '0')}` };
}

/** First day of the month after the quarter ends, as a Date (local time). */
export const quarterEndExclusive = (start: number) => new Date(Math.floor((start + 3) / 12), (start + 3) % 12, 1);
