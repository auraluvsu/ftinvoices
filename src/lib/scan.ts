import type { ScanResult } from './db';

/** The form fields a scan can fill, as the strings the inputs hold. */
export interface ScanFields {
  name: string;
  total: string;
  vat: string;
  date: string;
  category: string;
}

export interface MergeOptions {
  /** Today's date (YYYY-MM-DD); a date still set to today counts as empty. */
  today: string;
  /** The client's category names. */
  categories: string[];
  /** True if the category was picked by hand, or a new one is being created: leave it alone. */
  keepCategory: boolean;
  /** Category last used for a supplier name (lower-cased, trimmed), from supplier memory. */
  rememberedCategory: (supplierKey: string) => string | undefined;
}

export interface MergeResult {
  /** Only the fields that should change. */
  patch: Partial<ScanFields>;
  /** Set when the category came from supplier memory rather than the model. */
  remembered: string | null;
}

/**
 * Works out which fields a scan should fill: only empty ones (and a date still at today),
 * with your own past category for the supplier beating the model's guess.
 */
export function mergeScan(current: ScanFields, scan: ScanResult, opts: MergeOptions): MergeResult {
  const patch: Partial<ScanFields> = {};
  if (scan.name && !current.name.trim()) patch.name = scan.name;
  if (scan.total != null && !current.total.trim()) patch.total = scan.total.toFixed(2);
  if (scan.vat != null && !current.vat.trim()) patch.vat = scan.vat.toFixed(2);
  if (scan.date && (!current.date || current.date === opts.today)) patch.date = scan.date;

  let remembered: string | null = null;
  if (!opts.keepCategory) {
    const past = opts.rememberedCategory((patch.name ?? current.name).trim().toLowerCase());
    const pick = past && opts.categories.includes(past) ? past : scan.category;
    if (pick && pick !== current.category) patch.category = pick;
    if (past && pick === past) remembered = past;
  }
  return { patch, remembered };
}
