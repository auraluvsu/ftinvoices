import { useCallback, useMemo, useState } from 'react';
import type { Receipt } from './types';
import { DEFAULT_CATEGORY_COLORS, fallbackColor } from './lib/color';
import { AppDataContext as Ctx, type AppData, type Toast } from './appData';
import { isQuotaError, useLocalStorage } from './lib/storage';
import { exportReceipts } from './lib/export';
import type { QuarterStagger } from './lib/quarters';

const DEFAULT_CATEGORIES = [
  'Equipment',
  'Fuel',
  'Meals & entertainment',
  'Office supplies',
  'Software & subscriptions',
  'Travel',
  'Utilities',
  'Other',
];
const NO_RECEIPTS: Receipt[] = [];
const NO_COLORS: Record<string, string> = {};

/** Owns all persisted data (receipts, categories, settings) and app-wide toasts. */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [receipts, setReceipts] = useLocalStorage<Receipt[]>('ftinvoices.receipts', NO_RECEIPTS);
  const [storedCategories, setCategories] = useLocalStorage<string[]>('ftinvoices.categories', DEFAULT_CATEGORIES);
  const [storedColors, setColors] = useLocalStorage<Record<string, string>>('ftinvoices.categoryColors', NO_COLORS);
  const [stagger, setStaggerStored] = useLocalStorage<QuarterStagger>('ftinvoices.vatQuarterStagger', 0);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: Toast['kind'] = 'info', undo?: () => void) => {
    const id = Date.now();
    setToast({ id, msg, kind, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), undo ? 6000 : 4000);
  }, []);

  // Include any category used by a receipt even if it's not in the stored list.
  const categories = useMemo(() => {
    const all = new Set([...storedCategories, ...receipts.map((r) => r.category)]);
    return [...all].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  }, [storedCategories, receipts]);

  const categoryColor = useCallback(
    (name: string) => storedColors[name] ?? DEFAULT_CATEGORY_COLORS[name] ?? fallbackColor(name),
    [storedColors],
  );

  const value = useMemo<AppData>(() => {
    const saveFailed = (error: unknown) =>
      notify(
        isQuotaError(error)
          ? 'Storage is full — couldn’t save. Try removing the image or export and delete old receipts.'
          : 'Couldn’t save to browser storage.',
        'error',
      );

    return {
      receipts,
      categories,
      categoryColor,
      stagger,
      setStagger: (s) => setStaggerStored(() => s),
      saveReceipt: (receipt, newCategory) => {
        const isEdit = receipts.some((r) => r.id === receipt.id);
        const res = setReceipts((prev) =>
          isEdit ? prev.map((r) => (r.id === receipt.id ? receipt : r)) : [...prev, receipt],
        );
        if (!res.ok) {
          saveFailed(res.error);
          return false;
        }
        if (newCategory) {
          setCategories((prev) => [...prev, newCategory.name]);
          setColors((prev) => ({ ...prev, [newCategory.name]: newCategory.color }));
        }
        notify(isEdit ? 'Receipt updated' : `Added “${receipt.name}”`);
        return true;
      },
      deleteReceipt: (receipt) => {
        const res = setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
        if (!res.ok) return saveFailed(res.error);
        notify(`Deleted “${receipt.name}”`, 'info', () => {
          const r = setReceipts((prev) => (prev.some((x) => x.id === receipt.id) ? prev : [...prev, receipt]));
          if (!r.ok) saveFailed(r.error);
          setToast(null);
        });
      },
      exportList: async (list, format, label) => {
        try {
          await exportReceipts(list, format, label);
        } catch (e) {
          console.error(e);
          notify('Export failed', 'error');
        }
      },
      notify,
    };
  }, [receipts, categories, categoryColor, stagger, setReceipts, setCategories, setColors, setStaggerStored, notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button type="button" className="link-btn" onClick={toast.undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
