import type { Category, Client, Receipt } from '../types';
import type { QuarterStagger } from './quarters';
import * as db from './db';
import { dataUrlToBlob, urlToDataUrl } from './image';
import { DEFAULT_VAT_RATE, hasNoVat, isVatRate, type VatRate } from './vatRates';
import { isHex, normaliseHex } from './color';

/** Colour for a category that the backup doesn't give one for (must be a hex for the database). */
const FALLBACK_COLOR = '#9e9e9e';
import { newId, round2, todayIso } from './format';

/** A complete copy of one client's books, photos included, in a single JSON file. */
export interface Backup {
  format: 'ftinvoices-backup';
  version: 1;
  exportedAt: string;
  client: { name: string; vatNumber: string | null; stagger: QuarterStagger };
  categories: { name: string; color: string }[];
  receipts: {
    date: string;
    name: string;
    category: string;
    total: number;
    vat: number;
    /** Added after the first backups; missing means standard rate. */
    vatRate?: VatRate;
    createdAt: string;
    /** JPEG as a data: URL. */
    image?: string;
  }[];
}

export async function buildBackup(client: Client, categories: Category[], receipts: Receipt[]): Promise<Backup> {
  return {
    format: 'ftinvoices-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    client: { name: client.name, vatNumber: client.vatNumber, stagger: client.stagger },
    categories: categories.map((c) => ({ name: c.name, color: c.color })),
    receipts: await Promise.all(
      [...receipts]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(async (r) => ({
          date: r.date,
          name: r.name,
          category: r.category,
          total: r.total,
          vat: r.vat,
          vatRate: r.vatRate,
          createdAt: new Date(r.createdAt).toISOString(),
          image: r.image ? await urlToDataUrl(r.image) : undefined,
        })),
    ),
  };
}

export function downloadBackup(backup: Backup) {
  const slug = backup.client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug || 'client'}-backup-${todayIso()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Checks a parsed file is a backup this app can restore, and returns it cleaned up. Throws with a reason. */
export function parseBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.format !== 'ftinvoices-backup') throw new Error('This isn’t a bookkeeping backup file');
  if (b.version !== 1) throw new Error(`Unsupported backup version (${String(b.version)})`);
  if (!b.client || typeof b.client.name !== 'string' || !b.client.name.trim()) throw new Error('The backup has no client name');
  if (!Array.isArray(b.categories) || !Array.isArray(b.receipts)) throw new Error('The backup is incomplete');

  const categories = b.categories
    .filter((c) => c && typeof c.name === 'string' && c.name.trim())
    .map((c) => ({ name: c.name.trim(), color: typeof c.color === 'string' && isHex(c.color) ? normaliseHex(c.color) : FALLBACK_COLOR }));
  const receipts = b.receipts.map((r, i) => {
    const where = `receipt ${i + 1}`;
    if (!r || typeof r.name !== 'string' || !r.name.trim()) throw new Error(`${where} has no name`);
    if (!isDate(r.date)) throw new Error(`${where} has an invalid date`);
    if (!isAmount(r.total) || !isAmount(r.vat) || r.vat > r.total) throw new Error(`${where} has invalid amounts`);
    if (r.image !== undefined && (typeof r.image !== 'string' || !r.image.startsWith('data:image/')))
      throw new Error(`${where} has an invalid photo`);
    const vatRate = isVatRate(r.vatRate) ? r.vatRate : DEFAULT_VAT_RATE;
    if (hasNoVat(vatRate) && r.vat > 0) throw new Error(`${where} has VAT but is marked as having none`);
    return {
      date: r.date,
      name: r.name.trim(),
      category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : 'Other',
      total: round2(r.total),
      vat: round2(r.vat),
      vatRate,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
      image: r.image,
    };
  });
  const stagger = ([0, 1, 2] as const).includes(b.client.stagger as QuarterStagger) ? (b.client.stagger as QuarterStagger) : 0;
  return {
    format: 'ftinvoices-backup',
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
    client: { name: b.client.name.trim(), vatNumber: b.client.vatNumber?.trim() || null, stagger },
    categories,
    receipts,
  };
}

/** Same receipt: date, supplier (ignoring case) and total to the penny. */
const receiptKey = (r: { date: string; name: string; total: number }) =>
  `${r.date}|${r.name.trim().toLowerCase()}|${Math.round(r.total * 100)}`;

export interface RestorePlan {
  /** Receipts that will be added. */
  add: Backup['receipts'];
  /** Receipts skipped because the target already has them. */
  skipped: number;
}

/** What restoring into a client that already has `existing` receipts would do. */
export function planRestore(backup: Backup, existing: Pick<Receipt, 'date' | 'name' | 'total'>[]): RestorePlan {
  const have = new Set(existing.map(receiptKey));
  const add = backup.receipts.filter((r) => !have.has(receiptKey(r)));
  return { add, skipped: backup.receipts.length - add.length };
}

/**
 * Restores a backup into `target` (an existing client id), or into a new client when null.
 * Missing categories are created with the backup's colours. Returns the client id restored into.
 */
export async function restoreBackup(
  backup: Backup,
  plan: RestorePlan,
  target: string | null,
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const clientId =
    target ??
    (await db.createClient({ name: backup.client.name, vatNumber: backup.client.vatNumber, stagger: backup.client.stagger })).id;

  // Categories by lower-cased name; new clients start with the default set (database trigger).
  const cats = new Map((await db.listCategories(clientId)).map((c) => [c.name.toLowerCase(), c]));
  const colors = new Map(backup.categories.map((c) => [c.name.toLowerCase(), c.color]));
  const categoryFor = async (name: string) => {
    const key = name.toLowerCase();
    let cat = cats.get(key);
    if (!cat) {
      cat = await db.insertCategory(clientId, name, colors.get(key) ?? FALLBACK_COLOR);
      cats.set(key, cat);
    }
    return cat;
  };
  if (!target) {
    // A fresh client should look like the original: create every backed-up category and match colours.
    for (const c of backup.categories) {
      const existing = cats.get(c.name.toLowerCase());
      if (!existing) await categoryFor(c.name);
      else if (existing.color !== c.color) await db.updateCategory(existing.id, { color: c.color });
    }
  }

  let done = 0;
  onProgress?.(0, plan.add.length);
  for (const r of plan.add) {
    const category = await categoryFor(r.category);
    const id = newId();
    let imagePath: string | undefined;
    if (r.image) {
      imagePath = db.imagePathFor(userId, clientId, id);
      await db.uploadImage(imagePath, await dataUrlToBlob(r.image));
    }
    await db.upsertReceipt({
      id,
      clientId,
      categoryId: category.id,
      name: r.name,
      total: r.total,
      vat: r.vat,
      vatRate: r.vatRate ?? DEFAULT_VAT_RATE,
      date: r.date,
      imagePath,
      createdAt: Date.parse(r.createdAt) || Date.now(),
    });
    onProgress?.(++done, plan.add.length);
  }
  return clientId;
}
