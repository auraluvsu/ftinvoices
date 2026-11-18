/** How often a recurring expense comes round (stored in recurring_expenses.frequency). */
export type Frequency = 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCIES: readonly { id: Frequency; label: string; months: number }[] = [
  { id: 'monthly', label: 'Monthly', months: 1 },
  { id: 'quarterly', label: 'Every 3 months', months: 3 },
  { id: 'yearly', label: 'Yearly', months: 12 },
];

export const isFrequency = (v: unknown): v is Frequency => FREQUENCIES.some((f) => f.id === v);
export const frequencyLabel = (f: Frequency) => FREQUENCIES.find((x) => x.id === f)?.label ?? f;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The date one period after `iso`, on day `anchorDay` of the month, or the month's last day if
 * it's shorter (a bill on the 31st falls on 28/29 Feb, then 31 Mar again).
 */
export function addPeriod(iso: string, frequency: Frequency, anchorDay: number): string {
  const months = FREQUENCIES.find((f) => f.id === frequency)!.months;
  const [y, m] = iso.split('-').map(Number);
  const abs = y * 12 + (m - 1) + months;
  const year = Math.floor(abs / 12);
  const month = (abs % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(anchorDay, lastDay))}`;
}

/** Dates from `nextDate` up to and including `today` (oldest first), at most `max` of them. */
export function dueDates(
  r: { nextDate: string; frequency: Frequency; anchorDay: number },
  today: string,
  max = 12,
): string[] {
  const out: string[] = [];
  for (let d = r.nextDate; d <= today && out.length < max; d = addPeriod(d, r.frequency, r.anchorDay)) out.push(d);
  return out;
}

/** The first date after the last of `dates` (or `nextDate` itself if none). */
export function nextAfter(r: { nextDate: string; frequency: Frequency; anchorDay: number }, dates: string[]): string {
  return dates.length ? addPeriod(dates[dates.length - 1], r.frequency, r.anchorDay) : r.nextDate;
}
