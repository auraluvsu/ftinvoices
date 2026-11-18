import { createContext, useContext } from 'react';
import type { Category, Client, NewCategory, Receipt, ReceiptDraft } from './types';
import type { ExportFormat } from './lib/export';
import type { QuarterStagger } from './lib/quarters';

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
  exportList: (list: Receipt[], format: ExportFormat, label?: string) => Promise<void>;
  notify: (msg: string, kind?: Toast['kind'], undo?: () => void) => void;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}
