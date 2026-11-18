import type { Dispatch, SetStateAction } from 'react';
import type { AppData } from '../appData';
import type { Category, RecurringExpense } from '../types';
import * as db from '../lib/db';
import { newId } from '../lib/format';
import { addPeriod, frequencyLabel, nextAfter, type Frequency } from '../lib/recurring';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface RecurringActionDeps {
  clientId: string;
  categoryList: Category[];
  setStored: Dispatch<SetStateAction<db.StoredReceipt[]>>;
  setRecurring: Dispatch<SetStateAction<RecurringExpense[]>>;
  reloadSilently: () => void;
  notify: AppData['notify'];
}

/** Category for receipts from a recurring expense whose category was deleted. */
export const fallbackCategory = (categoryList: Category[]) =>
  categoryList.find((c) => c.name === 'Other') ?? categoryList[0];

/** Sets up a recurring expense from a receipt just added; the first repeat is one period after it. */
export function recurringFromReceipt(
  r: { clientId: string; categoryId: string; name: string; total: number; vat: number; vatRate: RecurringExpense['vatRate']; date: string },
  frequency: Frequency,
): Omit<RecurringExpense, 'id'> {
  const anchorDay = Number(r.date.slice(8, 10));
  return {
    clientId: r.clientId,
    categoryId: r.categoryId,
    name: r.name,
    total: r.total,
    vat: r.vat,
    vatRate: r.vatRate,
    frequency,
    anchorDay,
    nextDate: addPeriod(r.date, frequency, anchorDay),
  };
}

/** Adding due recurring expenses (after review), skipping some, and removing them. */
export function recurringActions({
  clientId,
  categoryList,
  setStored,
  setRecurring,
  reloadSilently,
  notify,
}: RecurringActionDeps): Pick<AppData, 'applyRecurring' | 'deleteRecurring'> {
  return {
    applyRecurring: async (expense, entries) => {
      const dates = entries.map((e) => e.date);
      const adding = entries.filter((e) => e.add);
      // New amounts from the review carry forward to future occurrences.
      const last = adding[adding.length - 1];
      const amounts = last && (last.total !== expense.total || last.vat !== expense.vat) ? { total: last.total, vat: last.vat } : undefined;
      const next = nextAfter(expense, dates);
      try {
        // Move the expense on first, so another device can't add the same dates meanwhile.
        const advanced = await db.advanceRecurring(expense.id, expense.nextDate, next, amounts);
        if (!advanced) {
          reloadSilently();
          notify(`“${expense.name}” was already handled on another device`, 'error');
          return false;
        }
        const categoryId = expense.categoryId ?? fallbackCategory(categoryList)?.id;
        if (adding.length && !categoryId) throw new Error('No category to put it in');
        let rows: db.StoredReceipt[];
        try {
          rows = await db.restoreReceipts(
            adding.map((e) => ({
              id: newId(),
              clientId,
              categoryId: categoryId!,
              name: expense.name,
              total: e.total,
              vat: e.vat,
              vatRate: expense.vatRate,
              date: e.date,
              createdAt: Date.now(),
            })),
          );
        } catch (e) {
          // Put the expense back so these dates are offered again.
          await db.advanceRecurring(expense.id, next, expense.nextDate, amounts && { total: expense.total, vat: expense.vat }).catch(console.error);
          throw e;
        }
        setRecurring((prev) => prev.map((r) => (r.id === advanced.id ? advanced : r)));
        setStored((prev) => [...prev, ...rows]);
        return true;
      } catch (e) {
        notify(`Couldn’t add “${expense.name}”: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    deleteRecurring: async (expense) => {
      try {
        await db.deleteRecurring(expense.id);
        setRecurring((prev) => prev.filter((r) => r.id !== expense.id));
        notify(`“${expense.name}” no longer repeats (${frequencyLabel(expense.frequency).toLowerCase()})`);
        return true;
      } catch (e) {
        notify(`Couldn’t remove it: ${errMsg(e)}`, 'error');
        return false;
      }
    },
  };
}
