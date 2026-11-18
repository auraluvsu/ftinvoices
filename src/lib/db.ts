import { supabase } from './supabase';
import type { Category, Client, Receipt } from '../types';
import type { QuarterStagger } from './quarters';
import type { Tables, TablesUpdate } from './database.types';

/** Thin, typed wrappers around Supabase. Every call throws on error. */

const BUCKET = 'receipts';
/** Signed image URLs last this long; the store re-signs well before expiry. */
export const SIGNED_URL_TTL = 12 * 60 * 60;

// Row shapes come from the generated database types (see database.types.ts).
type ClientRow = Pick<Tables<'clients'>, 'id' | 'name' | 'vat_number' | 'vat_quarter_stagger'>;
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'client_id' | 'name' | 'color'>;
type ReceiptRow = Pick<
  Tables<'receipts'>,
  'id' | 'client_id' | 'category_id' | 'name' | 'total' | 'vat' | 'date' | 'image_path' | 'created_at' | 'updated_at'
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
export async function reassignReceipts(clientId: string, fromId: string, toId: string): Promise<void> {
  check(
    await supabase.from('receipts').update({ category_id: toId }).eq('client_id', clientId).eq('category_id', fromId),
  );
}

// ---------- Receipts ----------
const RECEIPT_COLUMNS = 'id,client_id,category_id,name,total,vat,date,image_path,created_at,updated_at';

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

export async function scanReceipt(image: string, categories: string[]): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('scan-receipt', { body: { image, categories } });
  if (error) {
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
