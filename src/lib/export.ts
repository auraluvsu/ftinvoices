import type { Receipt } from '../types';
import { formatMonthKey, round2, todayIso } from './format';
import { groupByMonth, sumTotals } from './receipts';

export type ExportFormat = 'xlsx' | 'csv' | 'json';

const HEADERS = ['Date', 'Name', 'Category', 'Total', 'VAT', 'Net', 'Has image'] as const;

const toRow = (r: Receipt) => [
  r.date,
  r.name,
  r.category,
  round2(r.total),
  round2(r.vat),
  round2(r.total - r.vat),
  r.image ? 'Yes' : 'No',
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Quote anything with separators/quotes/newlines; neutralise formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportCsv(receipts: Receipt[], base: string) {
  const lines = [HEADERS.join(','), ...receipts.map((r) => toRow(r).map(csvCell).join(','))];
  // BOM so Excel opens UTF-8 (e.g. £, accents) correctly.
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
}

function exportJson(receipts: Receipt[], base: string) {
  const data = {
    exportedAt: new Date().toISOString(),
    count: receipts.length,
    receipts,
  };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${base}.json`);
}

async function exportXlsx(receipts: Receipt[], base: string) {
  const XLSX = await import('xlsx'); // lazy-load: only needed when exporting
  const wb = XLSX.utils.book_new();

  const sheetFor = (rows: Receipt[]) => {
    const t = sumTotals(rows);
    const ws = XLSX.utils.aoa_to_sheet([
      [...HEADERS],
      ...rows.map(toRow),
      [],
      ['', 'TOTAL', '', round2(t.total), round2(t.vat), round2(t.net)],
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    // Currency format on numeric columns.
    for (let r = 1; r <= rows.length + 2; r++) {
      for (const c of [3, 4, 5]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = '£#,##0.00';
      }
    }
    return ws;
  };

  // Summary sheet: one row per month.
  const groups = groupByMonth(receipts);
  const summary = XLSX.utils.aoa_to_sheet([
    ['Month', 'Receipts', 'Total', 'VAT', 'Net'],
    ...groups.map((g) => {
      const t = sumTotals(g.receipts);
      return [formatMonthKey(g.key), t.count, round2(t.total), round2(t.vat), round2(t.net)];
    }),
  ]);
  summary['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.utils.book_append_sheet(wb, sheetFor(receipts), 'All receipts');

  if (groups.length > 1) {
    for (const g of groups) {
      // Sheet names max 31 chars, no special chars — "November 2026" is fine.
      XLSX.utils.book_append_sheet(wb, sheetFor(g.receipts), formatMonthKey(g.key).slice(0, 31));
    }
  }

  XLSX.writeFile(wb, `${base}.xlsx`);
}

export async function exportReceipts(receipts: Receipt[], format: ExportFormat, label = 'receipts') {
  const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
  const base = `${label}-${todayIso()}`;
  if (format === 'csv') exportCsv(sorted, base);
  else if (format === 'json') exportJson(sorted, base);
  else await exportXlsx(sorted, base);
}
