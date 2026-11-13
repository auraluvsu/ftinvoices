import { supabase } from './supabase';
import type { Category, Client, Receipt } from '../types';
import type { QuarterStagger } from './quarters';

/** Thin, typed wrappers around Supabase. Every call throws on error. */

const BUCKET = 'receipts';
/** Signed image URLs last this long; the store re-signs well before expiry. */
export const SIGNED_URL_TTL = 12 * 60 * 60;

interface ClientRow {
  id: string;
  name: string;
  vat_number: string | null;
  vat_quarter_stagger: number;
}
interface CategoryRow {
  id: string;
  client_id: string;
  name: string;
  color: string;
}
interface ReceiptRow {
  id: string;
  client_id: string;
  category_id: string;
  name: string;
  total: number | string;
  vat: number | string;
  date: string;
  image_path: string | null;
  created_at: string;
}

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

// ---------- Clients ----------
export async function listClients(): Promise<Client[]> {
  const rows = check(await supabase.from('clients').select('id,name,vat_number,vat_quarter_stagger').order('created_at'));
  return (rows as ClientRow[]).map(toClient);
}

export async function createClient(c: Omit<Client, 'id'>): Promise<Client> {
  const row = check(
    await supabase
      .from('clients')
      .insert({ name: c.name, vat_number: c.vatNumber, vat_quarter_stagger: c.stagger })
      .select('id,name,vat_number,vat_quarter_stagger')
      .single(),
  );
  return toClient(row as ClientRow);
}

export async function updateClient(id: string, patch: Partial<Omit<Client, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.vatNumber !== undefined) row.vat_number = patch.vatNumber;
  if (patch.stagger !== undefined) row.vat_quarter_stagger = patch.stagger;
  check(await supabase.from('clients').update(row).eq('id', id));
}

// ---------- Categories ----------
export async function listCategories(clientId: string): Promise<Category[]> {
  const rows = check(await supabase.from('categories').select('id,client_id,name,color').eq('client_id', clientId));
  return (rows as CategoryRow[]).map(toCategory);
}

export async function insertCategory(clientId: string, name: string, color: string): Promise<Category> {
  const row = check(
    await supabase.from('categories').insert({ client_id: clientId, name, color }).select('id,client_id,name,color').single(),
  );
  return toCategory(row as CategoryRow);
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
export async function listReceipts(clientId: string): Promise<StoredReceipt[]> {
  const rows = check(
    await supabase
      .from('receipts')
      .select('id,client_id,category_id,name,total,vat,date,image_path,created_at')
      .eq('client_id', clientId)
      .order('date', { ascending: false }),
  );
  return (rows as ReceiptRow[]).map(toStoredReceipt);
}

export async function upsertReceipt(r: StoredReceipt): Promise<StoredReceipt> {
  const row = check(
    await supabase
      .from('receipts')
      .upsert(fromStoredReceipt(r))
      .select('id,client_id,category_id,name,total,vat,date,image_path,created_at')
      .single(),
  );
  return toStoredReceipt(row as ReceiptRow);
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
