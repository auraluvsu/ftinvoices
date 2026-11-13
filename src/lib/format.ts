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
