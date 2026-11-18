import type { Dispatch, SetStateAction } from 'react';
import type { AppData } from '../appData';
import type { Category } from '../types';
import * as db from '../lib/db';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface CategoryActionDeps {
  clientId: string;
  categoryList: Category[];
  setCategoryList: Dispatch<SetStateAction<Category[]>>;
  setStored: Dispatch<SetStateAction<db.StoredReceipt[]>>;
  notify: AppData['notify'];
}

/** Adding, editing, merging and deleting the open client's categories. Each resolves false on failure (after a toast). */
export function categoryActions({
  clientId,
  categoryList,
  setCategoryList,
  setStored,
  notify,
}: CategoryActionDeps): Pick<AppData, 'addCategory' | 'updateCategory' | 'mergeCategory' | 'deleteCategory'> {
  return {
    addCategory: async (name, color) => {
      try {
        const created = await db.insertCategory(clientId, name, color);
        setCategoryList((prev) => [...prev, created]);
        return true;
      } catch (e) {
        notify(`Couldn’t add category: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    updateCategory: async (id, patch) => {
      const before = categoryList;
      setCategoryList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      try {
        await db.updateCategory(id, patch);
        return true;
      } catch (e) {
        setCategoryList(before);
        notify(`Couldn’t update category: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    mergeCategory: async (fromId, toId) => {
      try {
        await db.reassignReceipts(clientId, fromId, toId);
        setStored((prev) => prev.map((r) => (r.categoryId === fromId ? { ...r, categoryId: toId } : r)));
        await db.deleteCategory(fromId);
        setCategoryList((prev) => prev.filter((c) => c.id !== fromId));
        return true;
      } catch (e) {
        notify(`Couldn’t merge: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    deleteCategory: async (id) => {
      try {
        await db.deleteCategory(id);
        setCategoryList((prev) => prev.filter((c) => c.id !== id));
        return true;
      } catch (e) {
        notify(`Couldn’t delete category: ${errMsg(e)}`, 'error');
        return false;
      }
    },
  };
}
