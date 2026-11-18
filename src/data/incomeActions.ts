import type { Dispatch, SetStateAction } from 'react';
import type { AppData } from '../appData';
import type { FiledQuarter, Income } from '../types';
import * as db from '../lib/db';
import { formatDate } from '../lib/format';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface IncomeActionDeps {
  income: Income[];
  setIncome: Dispatch<SetStateAction<Income[]>>;
  notify: AppData['notify'];
  dismissToast: () => void;
  lockedBy: (date: string) => FiledQuarter | undefined;
}

const lockedMessage = (f: FiledQuarter) =>
  `That’s in a VAT quarter filed on ${formatDate(f.filedAt.slice(0, 10))}. Unfile the quarter first to change it.`;

/** Adding, editing and deleting (with Undo) the open client's income. */
export function incomeActions({ income, setIncome, notify, dismissToast, lockedBy }: IncomeActionDeps): Pick<AppData, 'saveIncome' | 'deleteIncome'> {
  return {
    saveIncome: async (item) => {
      const existing = income.find((i) => i.id === item.id);
      const lock = (existing && lockedBy(existing.date)) ?? lockedBy(item.date);
      if (lock) {
        notify(lockedMessage(lock), 'error');
        return false;
      }
      try {
        const saved = await db.upsertIncome(item);
        setIncome((prev) => (existing ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev]));
        notify(existing ? 'Income updated' : `Added income from “${saved.customer}”`);
        return true;
      } catch (e) {
        notify(`Couldn’t save: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    deleteIncome: (item) => {
      const lock = lockedBy(item.date);
      if (lock) return notify(lockedMessage(lock), 'error');
      setIncome((prev) => prev.filter((i) => i.id !== item.id));
      db.deleteIncome(item.id).then(
        () =>
          notify(`Deleted income from “${item.customer}”`, 'info', async () => {
            dismissToast();
            try {
              const restored = await db.upsertIncome(item);
              setIncome((prev) => (prev.some((i) => i.id === restored.id) ? prev : [...prev, restored]));
            } catch (e) {
              notify(`Couldn’t restore: ${errMsg(e)}`, 'error');
            }
          }),
        (e) => {
          setIncome((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
          notify(`Couldn’t delete: ${errMsg(e)}`, 'error');
        },
      );
    },
  };
}
