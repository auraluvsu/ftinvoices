import { createContext, useContext } from 'react';
import type { NewCategory, Receipt } from './types';
import type { ExportFormat } from './lib/export';
import type { QuarterStagger } from './lib/quarters';

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
  undo?: () => void;
}

export interface AppData {
  receipts: Receipt[];
  categories: string[];
  /** Display colour for a category (hex). */
  categoryColor: (name: string) => string;
  stagger: QuarterStagger;
  setStagger: (s: QuarterStagger) => void;
  /** Adds or updates a receipt. Returns false if it couldn't be saved. */
  saveReceipt: (receipt: Receipt, newCategory?: NewCategory) => boolean;
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
