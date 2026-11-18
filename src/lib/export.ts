import type { Receipt } from '../types';
import { urlToDataUrl } from './image';
import { formatMonthKey, round2, todayIso } from './format';
import { groupByMonth, groupByYear, sumTotals } from './receipts';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'zip';

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

function csvText(receipts: Receipt[]): string {
  const lines = [HEADERS.join(','), ...receipts.map((r) => toRow(r).map(csvCell).join(','))];
  // BOM so Excel opens UTF-8 (e.g. £, accents) correctly.
  return '﻿' + lines.join('\r\n');
}

function exportCsv(receipts: Receipt[], base: string) {
  download(new Blob([csvText(receipts)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
}

/**
 * A readable, filesystem-safe name like "2026-11-02_Shell_£60.00.jpg". `taken` holds names already
 * used (lower-cased) so two receipts never overwrite each other: the second gets " (2)".
 */
export function imageFileName(r: Pick<Receipt, 'date' | 'name' | 'total'>, taken: Set<string>): string {
  const name =
    r.name
      // Characters Windows and macOS don't allow in file names, and control characters.
      // oxlint-disable-next-line eslint/no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 60) || 'receipt';
  const base = `${r.date}_${name}_£${r.total.toFixed(2)}`;
  let file = `${base}.jpg`;
  for (let n = 2; taken.has(file.toLowerCase()); n++) file = `${base} (${n}).jpg`;
  taken.add(file.toLowerCase());
  return file;
}

/** The receipts' photos, named by date, supplier and amount, plus receipts.csv, in one zip. */
async function exportZip(receipts: Receipt[], base: string) {
  const withImages = receipts.filter((r) => r.image);
  if (!withImages.length) throw new Error('None of these receipts have photos');
  const { zipSync, strToU8 } = await import('fflate');
  const taken = new Set<string>();
  const names = withImages.map((r) => imageFileName(r, taken));
  const images = await Promise.all(
    withImages.map(async (r) => {
      const res = await fetch(r.image!);
      if (!res.ok) throw new Error(`Couldn’t download the photo for ${r.name} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  );
  const files: Record<string, Uint8Array> = { 'receipts.csv': strToU8(csvText(receipts)) };
  names.forEach((n, i) => (files[n] = images[i]));
  // Photos are already JPEG-compressed, so store them as they are.
  const zip = zipSync(files, { level: 0 });
  download(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${base}-photos.zip`);
}

async function exportJson(receipts: Receipt[], base: string, meta?: ExportMeta) {
  const data = {
    exportedAt: new Date().toISOString(),
    client: meta ? { name: meta.client, vatNumber: meta.vatNumber ?? null } : undefined,
    count: receipts.length,
    receipts: await Promise.all(
      receipts.map(async (r) => ({
        id: r.id,
        date: r.date,
        name: r.name,
        category: r.category,
        total: r.total,
        vat: r.vat,
        createdAt: new Date(r.createdAt).toISOString(),
        // Embed images so the export is self-contained (signed URLs expire).
        image: r.image ? await urlToDataUrl(r.image) : undefined,
      })),
    ),
  };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${base}.json`);
}

async function exportXlsx(receipts: Receipt[], base: string, meta?: ExportMeta) {
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

  // Summary sheet: one row per year, then one row per month.
  const groups = groupByMonth(receipts);
  const totalsRow = (label: string, rows: Receipt[]) => {
    const t = sumTotals(rows);
    return [label, t.count, round2(t.total), round2(t.vat), round2(t.net)];
  };
  const summary = XLSX.utils.aoa_to_sheet([
    ...(meta ? [['Client', meta.client], ...(meta.vatNumber ? [['VAT number', meta.vatNumber]] : []), []] : []),
    ['Year', 'Receipts', 'Total', 'VAT', 'Net'],
    ...groupByYear(groups).map((y) => totalsRow(y.year, y.receipts)),
    [],
    ['Month', 'Receipts', 'Total', 'VAT', 'Net'],
    ...groups.map((g) => totalsRow(formatMonthKey(g.key), g.receipts)),
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

export interface ExportMeta {
  client: string;
  vatNumber?: string | null;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export async function exportReceipts(receipts: Receipt[], format: ExportFormat, label = 'receipts', meta?: ExportMeta) {
  const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
  const base = [meta && slug(meta.client), label, todayIso()].filter(Boolean).join('-');
  if (format === 'csv') exportCsv(sorted, base);
  else if (format === 'zip') await exportZip(sorted, base);
  else if (format === 'json') await exportJson(sorted, base, meta);
  else await exportXlsx(sorted, base, meta);
}
