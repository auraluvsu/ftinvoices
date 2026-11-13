import { useCallback, useMemo, useState } from 'react';
import type { Receipt } from './types';
import { isQuotaError, useLocalStorage } from './lib/storage';
import { groupByMonth, sumTotals } from './lib/receipts';
import { exportReceipts, type ExportFormat } from './lib/export';
import { formatMoney } from './lib/format';
import { ReceiptForm } from './components/ReceiptForm';
import { MonthSection } from './components/MonthSection';
import { ExportMenu } from './components/ExportMenu';
import { ImageModal } from './components/ImageModal';
import { ThemeToggle } from './components/ThemeToggle';

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
const STORAGE_LIMIT = 5 * 1024 * 1024; // typical browser localStorage quota

interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
  undo?: () => void;
}

export default function App() {
  const [receipts, setReceipts] = useLocalStorage<Receipt[]>('ftinvoices.receipts', NO_RECEIPTS);
  const [storedCategories, setCategories] = useLocalStorage<string[]>('ftinvoices.categories', DEFAULT_CATEGORIES);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [viewing, setViewing] = useState<Receipt | null>(null);
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

  const months = useMemo(() => groupByMonth(receipts), [receipts]);
  const grand = useMemo(() => sumTotals(receipts), [receipts]);
  // Rough size of what we store (UTF-16 → 2 bytes per char).
  const usage = useMemo(() => JSON.stringify(receipts).length * 2, [receipts]);

  const saveFailed = (error: unknown) =>
    notify(
      isQuotaError(error)
        ? 'Storage is full — couldn’t save. Try removing the image or export and delete old receipts.'
        : 'Couldn’t save to browser storage.',
      'error',
    );

  const handleSave = (receipt: Receipt, newCategory?: string): boolean => {
    const isEdit = receipts.some((r) => r.id === receipt.id);
    const res = setReceipts((prev) =>
      isEdit ? prev.map((r) => (r.id === receipt.id ? receipt : r)) : [...prev, receipt],
    );
    if (!res.ok) {
      saveFailed(res.error);
      return false;
    }
    if (newCategory) setCategories((prev) => [...prev, newCategory]);
    setEditing(null);
    notify(isEdit ? 'Receipt updated' : `Added “${receipt.name}”`);
    return true;
  };

  const handleDelete = (receipt: Receipt) => {
    const res = setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    if (!res.ok) return saveFailed(res.error);
    if (editing?.id === receipt.id) setEditing(null);
    notify(`Deleted “${receipt.name}”`, 'info', () => {
      const r = setReceipts((prev) => (prev.some((x) => x.id === receipt.id) ? prev : [...prev, receipt]));
      if (!r.ok) saveFailed(r.error);
      setToast(null);
    });
  };

  const handleExport = async (list: Receipt[], format: ExportFormat, label?: string) => {
    try {
      await exportReceipts(list, format, label);
    } catch (e) {
      console.error(e);
      notify('Export failed', 'error');
    }
  };

  const handleEdit = (r: Receipt) => {
    setEditing(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const usagePct = Math.min(100, (usage / STORAGE_LIMIT) * 100);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />
            </svg>
          </span>
          <h1>Bookkeeping</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <ExportMenu
            label="Export all"
            disabled={!receipts.length}
            onExport={(fmt) => handleExport(receipts, fmt, 'receipts')}
          />
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <ReceiptForm
            key={editing?.id ?? 'new'}
            categories={categories}
            editing={editing}
            onSave={handleSave}
            onCancelEdit={() => setEditing(null)}
            onError={(m) => notify(m, 'error')}
          />
          <div className={`storage${usagePct > 80 ? ' warn' : ''}`} title="Approximate browser storage used">
            <div className="storage-bar">
              <span style={{ width: `${usagePct}%` }} />
            </div>
            <span className="muted">
              Storage: {(usage / 1024 / 1024).toFixed(1)} MB of ~5 MB
            </span>
          </div>
        </aside>

        <div className="content">
          <div className="summary">
            <Stat label="All-time total" value={formatMoney(grand.total)} />
            <Stat label="All-time VAT" value={formatMoney(grand.vat)} />
            <Stat label="Receipts" value={String(grand.count)} />
          </div>

          {months.length === 0 ? (
            <div className="card empty">
              <h3>No receipts yet</h3>
              <p className="muted">Add your first receipt using the form. It’ll appear here grouped by month.</p>
            </div>
          ) : (
            months.map((m, i) => (
              <MonthSection
                key={m.key}
                monthKey={m.key}
                receipts={m.receipts}
                defaultOpen={i === 0}
                editingId={editing?.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewImage={setViewing}
                onExport={handleExport}
              />
            ))
          )}
        </div>
      </main>

      {viewing?.image && <ImageModal receipt={viewing} onClose={() => setViewing(null)} />}

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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
