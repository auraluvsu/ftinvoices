import { supabase, supabaseKey, supabaseUrl } from './supabase';
import type { Category, Client, FiledQuarter, Income, Receipt, RecurringExpense } from '../types';
import { isFrequency } from './recurring';
import type { QuarterStagger } from './quarters';
import type { Tables, TablesUpdate } from './database.types';
import { DEFAULT_VAT_RATE, isVatRate } from './vatRates';

/** Thin, typed wrappers around Supabase. Every call throws on error. */

const BUCKET = 'receipts';
/** Signed image URLs last this long; the store re-signs well before expiry. */
export const SIGNED_URL_TTL = 12 * 60 * 60;

// Row shapes come from the generated database types (see database.types.ts).
type ClientRow = Pick<Tables<'clients'>, 'id' | 'name' | 'vat_number' | 'vat_quarter_stagger'>;
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'client_id' | 'name' | 'color'>;
type ReceiptRow = Pick<
  Tables<'receipts'>,
  'id' | 'client_id' | 'category_id' | 'name' | 'total' | 'vat' | 'vat_rate' | 'date' | 'image_path' | 'created_at' | 'updated_at'
>;

const toClient = (r: ClientRow): Client => ({
  id: r.id,
  name: r.name,
  vatNumber: r.vat_number,
  stagger: (r.vat_quarter_stagger as QuarterStagger) ?? 0,
});
const toCategory = (r: CategoryRow): Category => ({ id: r.id, clientId: r.client_id, name: r.name, color: r.color });

/** Receipt without the joined category name / display URL. */
export type StoredReceipt = Omit<Receipt, 'category' | 'image'>;

export const toStoredReceipt = (r: ReceiptRow): StoredReceipt => ({
  id: r.id,
  clientId: r.client_id,
  categoryId: r.category_id,
  name: r.name,
  total: Number(r.total),
  vat: Number(r.vat),
  vatRate: isVatRate(r.vat_rate) ? r.vat_rate : DEFAULT_VAT_RATE,
  date: r.date,
  imagePath: r.image_path ?? undefined,
  createdAt: Date.parse(r.created_at),
  updatedAt: r.updated_at,
});

const fromStoredReceipt = (r: StoredReceipt) => ({
  id: r.id,
  client_id: r.clientId,
  category_id: r.categoryId,
  name: r.name,
  total: r.total,
  vat: r.vat,
  vat_rate: r.vatRate,
  date: r.date,
  image_path: r.imagePath ?? null,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Like check(), for `.single()` calls: the row must be there. */
function checkRow<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  const row = check(res);
  if (row == null) throw new Error('No row returned');
  return row;
}

// ---------- Clients ----------
export async function listClients(): Promise<Client[]> {
  const rows = check(await supabase.from('clients').select('id,name,vat_number,vat_quarter_stagger').order('created_at'));
  return (rows ?? []).map(toClient);
}

export async function createClient(c: Omit<Client, 'id'>): Promise<Client> {
  const row = checkRow(
    await supabase
      .from('clients')
      .insert({ name: c.name, vat_number: c.vatNumber, vat_quarter_stagger: c.stagger })
      .select('id,name,vat_number,vat_quarter_stagger')
      .single(),
  );
  return toClient(row);
}

export async function updateClient(id: string, patch: Partial<Omit<Client, 'id'>>): Promise<void> {
  const row: TablesUpdate<'clients'> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.vatNumber !== undefined) row.vat_number = patch.vatNumber;
  if (patch.stagger !== undefined) row.vat_quarter_stagger = patch.stagger;
  check(await supabase.from('clients').update(row).eq('id', id));
}

/**
 * Deletes a client for good: first every photo in its storage folder, then the client row
 * (the database removes its categories and receipts with it).
 */
export async function deleteClient(userId: string, clientId: string): Promise<void> {
  const folder = `${userId}/${clientId}`;
  const PAGE = 1000;
  // Always list from offset 0: each pass removes what it found, so the next pass sees the rest.
  for (;;) {
    const items = check(await supabase.storage.from(BUCKET).list(folder, { limit: PAGE })) ?? [];
    const paths = items.filter((it) => it.id).map((it) => `${folder}/${it.name}`);
    if (paths.length) check(await supabase.storage.from(BUCKET).remove(paths));
    if (items.length < PAGE) break;
  }
  check(await supabase.from('clients').delete().eq('id', clientId));
}

// ---------- Categories ----------
export async function listCategories(clientId: string): Promise<Category[]> {
  const rows = check(await supabase.from('categories').select('id,client_id,name,color').eq('client_id', clientId));
  return (rows ?? []).map(toCategory);
}

export async function insertCategory(clientId: string, name: string, color: string): Promise<Category> {
  const row = checkRow(
    await supabase.from('categories').insert({ client_id: clientId, name, color }).select('id,client_id,name,color').single(),
  );
  return toCategory(row);
}

export async function updateCategory(id: string, patch: { name?: string; color?: string }): Promise<void> {
  check(await supabase.from('categories').update(patch).eq('id', id));
}

export async function deleteCategory(id: string): Promise<void> {
  check(await supabase.from('categories').delete().eq('id', id));
}

/** Moves every receipt in one category to another (same client). */
/** Moves receipts and recurring expenses from one category to another (before a merge deletes the first). */
export async function reassignReceipts(clientId: string, fromId: string, toId: string): Promise<void> {
  check(
    await supabase.from('receipts').update({ category_id: toId }).eq('client_id', clientId).eq('category_id', fromId),
  );
  check(
    await supabase.from('recurring_expenses').update({ category_id: toId }).eq('client_id', clientId).eq('category_id', fromId),
  );
}

// ---------- Receipts ----------
const RECEIPT_COLUMNS = 'id,client_id,category_id,name,total,vat,vat_rate,date,image_path,created_at,updated_at';

export async function listReceipts(clientId: string): Promise<StoredReceipt[]> {
  const rows = check(
    await supabase
      .from('receipts')
      .select(RECEIPT_COLUMNS)
      .eq('client_id', clientId)
      .order('date', { ascending: false }),
  );
  return (rows ?? []).map(toStoredReceipt);
}

export async function upsertReceipt(r: StoredReceipt): Promise<StoredReceipt> {
  const row = checkRow(
    await supabase
      .from('receipts')
      .upsert(fromStoredReceipt(r))
      .select(RECEIPT_COLUMNS)
      .single(),
  );
  return toStoredReceipt(row);
}

/** Thrown when a receipt was changed or deleted elsewhere since it was loaded. */
export class ReceiptConflictError extends Error {
  constructor() {
    super('This receipt was changed on another device or tab');
    this.name = 'ReceiptConflictError';
  }
}

/**
 * Updates an existing receipt only if it still has the `updated_at` it was loaded with,
 * so an old copy can't silently overwrite newer edits. Throws ReceiptConflictError otherwise.
 */
export async function updateReceipt(r: StoredReceipt, expectedUpdatedAt: string): Promise<StoredReceipt> {
  const { id, ...fields } = fromStoredReceipt(r);
  const row = check(
    await supabase
      .from('receipts')
      .update(fields)
      .eq('id', id)
      .eq('updated_at', expectedUpdatedAt)
      .select(RECEIPT_COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw new ReceiptConflictError();
  return toStoredReceipt(row);
}

export async function deleteReceipt(id: string): Promise<void> {
  check(await supabase.from('receipts').delete().eq('id', id));
}

// ---------- Several receipts at once ----------
export async function deleteReceipts(ids: string[]): Promise<void> {
  if (ids.length) check(await supabase.from('receipts').delete().in('id', ids));
}

/** Re-inserts receipts exactly as they were (Undo after a bulk delete). */
export async function restoreReceipts(rows: StoredReceipt[]): Promise<StoredReceipt[]> {
  if (!rows.length) return [];
  const data = check(
    await supabase
      .from('receipts')
      .upsert(rows.map(fromStoredReceipt))
      .select(RECEIPT_COLUMNS),
  );
  return (data ?? []).map(toStoredReceipt);
}

/** Moves receipts of one client to another of its categories; returns the updated rows. */
export async function setReceiptsCategory(clientId: string, ids: string[], categoryId: string): Promise<StoredReceipt[]> {
  if (!ids.length) return [];
  const data = check(
    await supabase
      .from('receipts')
      .update({ category_id: categoryId })
      .eq('client_id', clientId)
      .in('id', ids)
      .select(RECEIPT_COLUMNS),
  );
  return (data ?? []).map(toStoredReceipt);
}

// ---------- Filed VAT quarters ----------
type FiledRow = Pick<
  Tables<'filed_quarters'>,
  'id' | 'client_id' | 'period_start' | 'period_end' | 'filed_at' | 'box1' | 'box4' | 'box6' | 'box7'
>;
const FILED_COLUMNS = 'id,client_id,period_start,period_end,filed_at,box1,box4,box6,box7';
const toFiled = (r: FiledRow): FiledQuarter => ({
  id: r.id,
  clientId: r.client_id,
  start: r.period_start,
  end: r.period_end,
  filedAt: r.filed_at,
  box4: Number(r.box4),
  box7: Number(r.box7),
  box1: r.box1 == null ? null : Number(r.box1),
  box6: r.box6 == null ? null : Number(r.box6),
});

export async function listFiledQuarters(clientId: string): Promise<FiledQuarter[]> {
  const rows = check(await supabase.from('filed_quarters').select(FILED_COLUMNS).eq('client_id', clientId).order('period_start'));
  return (rows ?? []).map(toFiled);
}

export async function fileQuarter(
  clientId: string,
  period: { from: string; to: string },
  boxes: { box1: number; box4: number; box6: number; box7: number },
): Promise<FiledQuarter> {
  const row = checkRow(
    await supabase
      .from('filed_quarters')
      .insert({ client_id: clientId, period_start: period.from, period_end: period.to, ...boxes })
      .select(FILED_COLUMNS)
      .single(),
  );
  return toFiled(row);
}

export async function unfileQuarter(id: string): Promise<void> {
  check(await supabase.from('filed_quarters').delete().eq('id', id));
}

// ---------- Income ----------
type IncomeRow = Pick<
  Tables<'income'>,
  'id' | 'client_id' | 'customer' | 'reference' | 'description' | 'net' | 'vat' | 'vat_rate' | 'date' | 'created_at'
>;
const INCOME_COLUMNS = 'id,client_id,customer,reference,description,net,vat,vat_rate,date,created_at';
const toIncome = (r: IncomeRow): Income => ({
  id: r.id,
  clientId: r.client_id,
  customer: r.customer,
  reference: r.reference ?? undefined,
  description: r.description ?? undefined,
  net: Number(r.net),
  vat: Number(r.vat),
  vatRate: isVatRate(r.vat_rate) ? r.vat_rate : DEFAULT_VAT_RATE,
  date: r.date,
  createdAt: Date.parse(r.created_at),
});

export async function listIncome(clientId: string): Promise<Income[]> {
  const rows = check(await supabase.from('income').select(INCOME_COLUMNS).eq('client_id', clientId).order('date', { ascending: false }));
  return (rows ?? []).map(toIncome);
}

/** Adds or replaces an income record (also used to undo a delete). */
export async function upsertIncome(i: Income): Promise<Income> {
  const row = checkRow(
    await supabase
      .from('income')
      .upsert({
        id: i.id,
        client_id: i.clientId,
        customer: i.customer,
        reference: i.reference ?? null,
        description: i.description ?? null,
        net: i.net,
        vat: i.vat,
        vat_rate: i.vatRate,
        date: i.date,
        created_at: new Date(i.createdAt).toISOString(),
      })
      .select(INCOME_COLUMNS)
      .single(),
  );
  return toIncome(row);
}

export async function deleteIncome(id: string): Promise<void> {
  check(await supabase.from('income').delete().eq('id', id));
}

// ---------- Recurring expenses ----------
type RecurringRow = Pick<
  Tables<'recurring_expenses'>,
  'id' | 'client_id' | 'category_id' | 'name' | 'total' | 'vat' | 'vat_rate' | 'frequency' | 'anchor_day' | 'next_date'
>;
const RECURRING_COLUMNS = 'id,client_id,category_id,name,total,vat,vat_rate,frequency,anchor_day,next_date';
const toRecurring = (r: RecurringRow): RecurringExpense => ({
  id: r.id,
  clientId: r.client_id,
  categoryId: r.category_id,
  name: r.name,
  total: Number(r.total),
  vat: Number(r.vat),
  vatRate: isVatRate(r.vat_rate) ? r.vat_rate : DEFAULT_VAT_RATE,
  frequency: isFrequency(r.frequency) ? r.frequency : 'monthly',
  anchorDay: r.anchor_day,
  nextDate: r.next_date,
});

export async function listRecurring(clientId: string): Promise<RecurringExpense[]> {
  const rows = check(await supabase.from('recurring_expenses').select(RECURRING_COLUMNS).eq('client_id', clientId).order('next_date'));
  return (rows ?? []).map(toRecurring);
}

export async function insertRecurring(r: Omit<RecurringExpense, 'id'>): Promise<RecurringExpense> {
  const row = checkRow(
    await supabase
      .from('recurring_expenses')
      .insert({
        client_id: r.clientId,
        category_id: r.categoryId,
        name: r.name,
        total: r.total,
        vat: r.vat,
        vat_rate: r.vatRate,
        frequency: r.frequency,
        anchor_day: r.anchorDay,
        next_date: r.nextDate,
      })
      .select(RECURRING_COLUMNS)
      .single(),
  );
  return toRecurring(row);
}

/**
 * Moves a recurring expense on to `nextDate` (optionally with new amounts), but only if it's still
 * at `expectedNextDate`, so two devices can't both add the same month. Returns null if it wasn't.
 */
export async function advanceRecurring(
  id: string,
  expectedNextDate: string,
  nextDate: string,
  amounts?: { total: number; vat: number },
): Promise<RecurringExpense | null> {
  const row = check(
    await supabase
      .from('recurring_expenses')
      .update({ next_date: nextDate, ...amounts })
      .eq('id', id)
      .eq('next_date', expectedNextDate)
      .select(RECURRING_COLUMNS)
      .maybeSingle(),
  );
  return row ? toRecurring(row) : null;
}

export async function deleteRecurring(id: string): Promise<void> {
  check(await supabase.from('recurring_expenses').delete().eq('id', id));
}

// ---------- Images (private bucket) ----------
export const imagePathFor = (userId: string, clientId: string, receiptId: string) =>
  // Timestamp keeps paths unique, so a replaced image never reuses a cached URL.
  `${userId}/${clientId}/${receiptId}-${Date.now()}.jpg`;

export async function uploadImage(path: string, blob: Blob): Promise<void> {
  check(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
}

export async function removeImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  check(await supabase.storage.from(BUCKET).remove(paths));
}

/** Every image path stored under a folder such as `{user}/{client}`. */
export async function listImages(folder: string): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const items = check(await supabase.storage.from(BUCKET).list(folder, { limit: PAGE, offset })) ?? [];
    // Sub-folders come back with a null id; there shouldn't be any, but skip them.
    for (const it of items) if (it.id) out.push(`${folder}/${it.name}`);
    if (items.length < PAGE) return out;
  }
}

// The latest access token, kept so images can be deleted while the page is closing,
// when there's no time to await getSession(). The store keeps it up to date.
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Deletes images with a `keepalive` request, which the browser finishes even after the
 * page has gone (used on `pagehide`). Fire-and-forget: there's no result to wait for.
 */
export function removeImagesOnExit(paths: string[]): void {
  if (!paths.length || !accessToken) return;
  void fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    keepalive: true,
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => {
    /* best effort */
  });
}

/** Map of path → signed URL. Missing/failed paths are left out. */
export async function signImages(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const data = check(await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL));
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

// ---------- Receipt scanning (Edge Function → Claude) ----------
export interface ScanResult {
  name: string | null;
  total: number | null;
  vat: number | null;
  date: string | null;
  category: string | null;
}

/** Thrown when the scan-receipt function isn't deployed in this Supabase project. */
export class ScanUnavailableError extends Error {
  constructor() {
    super('Receipt reading isn’t set up yet (the scan-receipt function isn’t deployed)');
    this.name = 'ScanUnavailableError';
  }
}

export async function scanReceipt(image: string, categories: string[]): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('scan-receipt', { body: { image, categories } });
  if (error) {
    if ((error as { context?: Response }).context?.status === 404) throw new ScanUnavailableError();
    let message = error.message;
    try {
      // The function returns { error: "…" } with a friendly message.
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return data as ScanResult;
}
