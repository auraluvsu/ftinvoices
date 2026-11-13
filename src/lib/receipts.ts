import type { MonthFilters, Receipt, SortDir, SortField } from '../types';
import { monthKey } from './format';

export interface MonthGroup {
  key: string; // YYYY-MM
  receipts: Receipt[];
}

/** Group receipts by month, newest month first. */
export function groupByMonth(receipts: Receipt[]): MonthGroup[] {
  const map = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const k = monthKey(r.date);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, receipts]) => ({ key, receipts }));
}

export function sumTotals(receipts: Receipt[]) {
  let total = 0;
  let vat = 0;
  for (const r of receipts) {
    total += r.total;
    vat += r.vat;
  }
  return { total, vat, net: total - vat, count: receipts.length };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function applyFilters(receipts: Receipt[], f: MonthFilters): Receipt[] {
  const minT = num(f.minTotal);
  const maxT = num(f.maxTotal);
  const minV = num(f.minVat);
  const maxV = num(f.maxVat);
  return receipts.filter((r) => {
    if (minT !== null && r.total < minT) return false;
    if (maxT !== null && r.total > maxT) return false;
    if (minV !== null && r.vat < minV) return false;
    if (maxV !== null && r.vat > maxV) return false;
    if (f.dateFrom && r.date < f.dateFrom) return false;
    if (f.dateTo && r.date > f.dateTo) return false;
    if (f.categories.length && !f.categories.includes(r.category)) return false;
    return true;
  });
}

export function sortReceipts(receipts: Receipt[], field: SortField, dir: SortDir): Receipt[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...receipts].sort((a, b) => {
    let cmp: number;
    switch (field) {
      case 'date':
        cmp = a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
        break;
      case 'total':
        cmp = a.total - b.total;
        break;
      case 'vat':
        cmp = a.vat - b.vat;
        break;
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;
    }
    return cmp * sign;
  });
}

export function activeFilterCount(f: MonthFilters): number {
  return (
    [f.minTotal, f.maxTotal, f.minVat, f.maxVat, f.dateFrom, f.dateTo].filter((v) => v !== '')
      .length + (f.categories.length ? 1 : 0)
  );
}

export interface YearGroup {
  year: string; // YYYY
  months: MonthGroup[];
  receipts: Receipt[];
}

/** Group month groups (already newest first) by calendar year, newest first. */
export function groupByYear(months: MonthGroup[]): YearGroup[] {
  const years: YearGroup[] = [];
  for (const m of months) {
    const year = m.key.slice(0, 4);
    let g = years[years.length - 1];
    if (!g || g.year !== year) {
      g = { year, months: [], receipts: [] };
      years.push(g);
    }
    g.months.push(m);
    g.receipts.push(...m.receipts);
  }
  return years;
}

export interface Supplier {
  /** Name as last written */
  name: string;
  /** Category used on the most recent receipt from this supplier */
  category: string;
  count: number;
}

/** Past suppliers keyed by lower-cased, trimmed name, remembering the most recent category. */
export function supplierMemory(receipts: Receipt[]): Map<string, Supplier> {
  const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const map = new Map<string, Supplier>();
  for (const r of sorted) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    map.set(key, { name: r.name.trim(), category: r.category, count: (map.get(key)?.count ?? 0) + 1 });
  }
  return map;
}

/**
 * Search across all receipts. Words must all match (name or category, any order);
 * a number like "60" or "12.5" also matches totals/VAT that start with it (60.00, 12.50).
 */
export function searchReceipts(receipts: Receipt[], query: string): Receipt[] {
  const words = query.trim().toLowerCase().replace(/£/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return receipts;
  return receipts.filter((r) => {
    const text = `${r.name} ${r.category}`.toLowerCase();
    const amounts = [r.total.toFixed(2), r.vat.toFixed(2)];
    return words.every(
      (w) => text.includes(w) || (/^\d+(\.\d{0,2})?$/.test(w) && amounts.some((a) => a.startsWith(w.replace(/\.$/, '')))),
    );
  });
}
