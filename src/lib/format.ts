export const CURRENCY = 'GBP';
export const LOCALE = 'en-GB';

const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
export const formatMoney = (n: number) => money.format(n);

export const formatDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** "2026-11" -> "November 2026" */
export const formatMonthKey = (key: string) =>
  new Date(key + '-01T00:00:00').toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

export const monthKey = (isoDate: string) => isoDate.slice(0, 7);

export const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Compact money for axis ticks: £0, £850, £1.2k, £15k. */
export const formatMoneyShort = (n: number) =>
  n >= 1000 ? `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : `£${Math.round(n)}`;

/**
 * Whole calendar days from `from` to `to` (local dates). Uses UTC day numbers so the
 * 23- and 25-hour days at the clock changes don't shift the count.
 */
export const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      86_400_000,
  );
