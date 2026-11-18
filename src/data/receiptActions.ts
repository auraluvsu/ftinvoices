import type { Dispatch, SetStateAction } from 'react';
import type { AppData } from '../appData';
import type { Category, FiledQuarter } from '../types';
import { formatDate } from '../lib/format';
import { dataUrlToBlob } from '../lib/image';
import * as db from '../lib/db';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface ReceiptActionDeps {
  userId: string;
  clientId: string;
  categoryList: Category[];
  setCategoryList: Dispatch<SetStateAction<Category[]>>;
  stored: db.StoredReceipt[];
  setStored: Dispatch<SetStateAction<db.StoredReceipt[]>>;
  /** Reloads the open client's books in place (after an edit conflict). */
  reloadSilently: () => void;
  notify: AppData['notify'];
  dismissToast: () => void;
  showLocal: (path: string, dataUrl: string) => void;
  scheduleImageDelete: (path: string) => void;
  cancelImageDelete: (path: string) => void;
  /** The filed quarter locking a date, if any (the database enforces this too). */
  lockedBy: (date: string) => FiledQuarter | undefined;
}

const lockedMessage = (f: FiledQuarter) =>
  `That’s in a VAT quarter filed on ${formatDate(f.filedAt.slice(0, 10))}. Unfile the quarter first to change it.`;

/** Saving, deleting (with Undo) and moving receipts of the open client. */
export function receiptActions({
  userId,
  clientId,
  categoryList,
  setCategoryList,
  stored,
  setStored,
  reloadSilently,
  notify,
  dismissToast,
  showLocal,
  scheduleImageDelete,
  cancelImageDelete,
  lockedBy,
}: ReceiptActionDeps): Pick<AppData, 'saveReceipt' | 'deleteReceipt' | 'deleteReceipts' | 'moveReceipts'> {
  return {
    saveReceipt: async (draft, newCategory) => {
      const existing = stored.find((r) => r.id === draft.id);
      const lock = (existing && lockedBy(existing.date)) ?? lockedBy(draft.date);
      if (lock) {
        notify(lockedMessage(lock), 'error');
        return false;
      }
      let uploadedPath: string | undefined;
      try {
        // 1. Category (create it first if new)
        let category = categoryList.find((c) => c.name === draft.category);
        if (newCategory) {
          category = await db.insertCategory(clientId, newCategory.name, newCategory.color);
          const created = category;
          setCategoryList((prev) => [...prev, created]);
        }
        if (!category) throw new Error(`Unknown category “${draft.category}”`);

        // 2. Image: upload a new one, keep the old one, or drop it
        let imagePath = existing?.imagePath;
        const isNewImage = draft.image?.startsWith('data:');
        if (isNewImage) {
          uploadedPath = db.imagePathFor(userId, clientId, draft.id);
          await db.uploadImage(uploadedPath, await dataUrlToBlob(draft.image!));
          imagePath = uploadedPath;
        } else if (!draft.image) {
          imagePath = undefined;
        }

        // 3. Row. Edits only apply if nobody changed the receipt elsewhere meanwhile.
        const row: db.StoredReceipt = {
          id: draft.id,
          clientId: clientId,
          categoryId: category.id,
          name: draft.name,
          total: draft.total,
          vat: draft.vat,
          vatRate: draft.vatRate,
          date: draft.date,
          imagePath,
          createdAt: existing?.createdAt ?? Date.now(),
        };
        const saved = existing?.updatedAt ? await db.updateReceipt(row, existing.updatedAt) : await db.upsertReceipt(row);

        // Show the freshly uploaded image straight from memory; no need to sign it yet.
        if (isNewImage && imagePath) showLocal(imagePath, draft.image!);
        setStored((prev) => (existing ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]));

        // Old image replaced or removed → delete it from storage.
        if (existing?.imagePath && existing.imagePath !== imagePath) {
          db.removeImages([existing.imagePath]).catch(console.error);
        }
        notify(existing ? 'Receipt updated' : `Added “${draft.name}”`);
        return true;
      } catch (e) {
        if (uploadedPath) db.removeImages([uploadedPath]).catch(console.error);
        if (e instanceof db.ReceiptConflictError) {
          // Load the newer version; the form stays open, so saving again overwrites it on purpose.
          reloadSilently();
          notify(`${e.message}. The latest version is loaded — save again to replace it.`, 'error');
          return false;
        }
        notify(`Couldn’t save: ${errMsg(e)}`, 'error');
        return false;
      }
    },

    deleteReceipt: (receipt) => {
      const row = stored.find((r) => r.id === receipt.id);
      if (!row) return;
      const lock = lockedBy(row.date);
      if (lock) return notify(lockedMessage(lock), 'error');
      setStored((prev) => prev.filter((r) => r.id !== row.id));
      db.deleteReceipt(row.id).then(
        () => {
          if (row.imagePath) scheduleImageDelete(row.imagePath);
          notify(`Deleted “${row.name}”`, 'info', async () => {
            if (row.imagePath) cancelImageDelete(row.imagePath);
            dismissToast();
            try {
              const restored = await db.upsertReceipt(row);
              setStored((prev) => (prev.some((r) => r.id === restored.id) ? prev : [...prev, restored]));
            } catch (e) {
              notify(`Couldn’t restore: ${errMsg(e)}`, 'error');
            }
          });
        },
        (e) => {
          setStored((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
          notify(`Couldn’t delete: ${errMsg(e)}`, 'error');
        },
      );
    },

    deleteReceipts: (list) => {
      const wanted = new Set(list.map((r) => r.id));
      const all = stored.filter((r) => wanted.has(r.id));
      const rows = all.filter((r) => !lockedBy(r.date));
      const skipped = all.length - rows.length;
      if (!rows.length) {
        if (skipped) notify('Those receipts are in filed VAT quarters, so they can’t be deleted. Unfile the quarter first.', 'error');
        return;
      }
      const ids = new Set(rows.map((r) => r.id));
      setStored((prev) => prev.filter((r) => !ids.has(r.id)));
      db.deleteReceipts([...ids]).then(
        () => {
          const paths = rows.flatMap((r) => (r.imagePath ? [r.imagePath] : []));
          paths.forEach(scheduleImageDelete);
          const kept = skipped ? ` (${skipped} in filed quarters kept)` : '';
          notify(`Deleted ${rows.length} receipt${rows.length === 1 ? '' : 's'}${kept}`, 'info', async () => {
            paths.forEach(cancelImageDelete);
            dismissToast();
            try {
              const restored = await db.restoreReceipts(rows);
              setStored((prev) => [...prev.filter((r) => !ids.has(r.id)), ...restored]);
            } catch (e) {
              notify(`Couldn’t restore: ${errMsg(e)}`, 'error');
            }
          });
        },
        (e) => {
          setStored((prev) => [...prev.filter((r) => !ids.has(r.id)), ...rows]);
          notify(`Couldn’t delete: ${errMsg(e)}`, 'error');
        },
      );
    },

    moveReceipts: async (list, categoryName) => {
      const category = categoryList.find((c) => c.name === categoryName);
      if (!category) return false;
      try {
        const updated = await db.setReceiptsCategory(clientId, list.map((r) => r.id), category.id);
        const byId = new Map(updated.map((r) => [r.id, r]));
        setStored((prev) => prev.map((r) => byId.get(r.id) ?? r));
        notify(`Moved ${updated.length} receipt${updated.length === 1 ? '' : 's'} to “${category.name}”`);
        return true;
      } catch (e) {
        notify(`Couldn’t move receipts: ${errMsg(e)}`, 'error');
        return false;
      }
    },
  };
}
