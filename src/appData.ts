import { createContext, useContext } from 'react';
import type { Category, Client, FiledQuarter, Income, NewCategory, Receipt, ReceiptDraft, RecurringExpense } from './types';
import type { ExportFormat } from './lib/export';
import type { QuarterStagger } from './lib/quarters';
import type { VatReturnBoxes } from './lib/vatReturn';

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
  undo?: () => void;
}

export interface AppData {
  /** The client whose books are open. */
  client: Client;
  clients: Client[];
  switchClient: (id: string) => void;
  /** Reloads the open client's books from Supabase (e.g. after a restore). */
  reloadBooks: () => Promise<void>;
  /** Opens the client settings popup (for the open client, or a new one). */
  /** 'delete' opens the delete-client confirmation. */
  openClientSettings: (mode?: 'edit' | 'new' | 'delete') => void;
  receipts: Receipt[];
  /** Category names for the open client, sorted with "Other" last. */
  categories: string[];
  categoryList: Category[];
  /** Display colour for a category (hex). */
  categoryColor: (name: string) => string;
  addCategory: (name: string, color: string) => Promise<boolean>;
  updateCategory: (id: string, patch: { name?: string; color?: string }) => Promise<boolean>;
  /** Moves all receipts from one category into another, then deletes the first. */
  mergeCategory: (fromId: string, toId: string) => Promise<boolean>;
  /** Deletes an unused category. */
  deleteCategory: (id: string) => Promise<boolean>;
  openCategoryManager: () => void;
  stagger: QuarterStagger;
  /** Adds or updates a receipt (uploading any new image). Resolves false if it couldn't be saved. */
  saveReceipt: (draft: ReceiptDraft, newCategory?: NewCategory) => Promise<boolean>;
  deleteReceipt: (receipt: Receipt) => void;
  /** Deletes several receipts, with one Undo for all of them. */
  deleteReceipts: (receipts: Receipt[]) => void;
  /** Moves receipts to another category. Resolves false if it couldn't be saved. */
  moveReceipts: (receipts: Receipt[], category: string) => Promise<boolean>;
  exportList: (list: Receipt[], format: ExportFormat, label?: string) => Promise<void>;
  /** VAT quarters marked as filed, oldest first. */
  filedQuarters: FiledQuarter[];
  /** The filed quarter that locks receipts on this date, if any. */
  lockedBy: (date: string) => FiledQuarter | undefined;
  /** Marks a quarter as filed, storing its Box 4 and Box 7. `label` is for the toast. */
  fileQuarter: (period: { from: string; to: string }, boxes: VatReturnBoxes, label: string) => Promise<boolean>;
  unfileQuarter: (filed: FiledQuarter, label: string) => Promise<boolean>;
  /** Recurring expenses, soonest first. */
  recurring: RecurringExpense[];
  /** Recurring expenses with dates due up to today, waiting for review. */
  dueRecurring: { expense: RecurringExpense; dates: string[] }[];
  /**
   * Handles every due date of one recurring expense: those marked `add` become receipts (with the
   * amounts given), the rest are skipped. Resolves false if nothing changed.
   */
  applyRecurring: (
    expense: RecurringExpense,
    entries: { date: string; add: boolean; total: number; vat: number }[],
  ) => Promise<boolean>;
  deleteRecurring: (expense: RecurringExpense) => Promise<boolean>;
  /** Income (sales), newest first. */
  income: Income[];
  /** Adds or updates an income record. Resolves false if it couldn't be saved. */
  saveIncome: (item: Income) => Promise<boolean>;
  /** Deletes an income record, with Undo. */
  deleteIncome: (item: Income) => void;
  notify: (msg: string, kind?: Toast['kind'], undo?: () => void) => void;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}
