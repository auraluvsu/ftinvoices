import { useMemo, useState } from 'react';
import type { NewCategory, Receipt } from '../types';
import { useAppData } from '../appData';
import { groupByMonth, groupByYear, sumTotals } from '../lib/receipts';
import { formatMoney } from '../lib/format';
import { ReceiptForm } from '../components/ReceiptForm';
import { MonthSection } from '../components/MonthSection';
import { YearHeader } from '../components/YearHeader';
import { QuarterlyReview } from '../components/QuarterlyReview';
import { ImageModal } from '../components/ImageModal';
import { EditReceiptModal } from '../components/EditReceiptModal';
import { Stat } from '../components/Stat';

const VIEW_KEY = 'ftinvoices.view';
const STORAGE_LIMIT = 5 * 1024 * 1024; // typical browser localStorage quota
type View = 'monthly' | 'quarterly';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'quarterly' ? 'quarterly' : 'monthly';
  } catch {
    return 'monthly';
  }
}

export function ReceiptsPage() {
  const { receipts, categories, stagger, setStagger, saveReceipt, deleteReceipt, exportList, notify } = useAppData();
  const [view, setViewState] = useState<View>(readView);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [viewing, setViewing] = useState<Receipt | null>(null);

  const years = useMemo(() => groupByYear(groupByMonth(receipts)), [receipts]);
  const newestMonth = years[0]?.months[0]?.key;
  const grand = useMemo(() => sumTotals(receipts), [receipts]);
  // Rough size of what we store (UTF-16 → 2 bytes per char).
  const usage = useMemo(() => JSON.stringify(receipts).length * 2, [receipts]);
  const usagePct = Math.min(100, (usage / STORAGE_LIMIT) * 100);

  const handleSave = (receipt: Receipt, newCategory?: NewCategory) => {
    const ok = saveReceipt(receipt, newCategory);
    if (ok) setEditing(null);
    return ok;
  };

  const handleDelete = (receipt: Receipt) => {
    if (editing?.id === receipt.id) setEditing(null);
    deleteReceipt(receipt);
  };

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* non-essential */
    }
  };

  return (
    <main className="layout">
      <aside className="sidebar">
        <ReceiptForm categories={categories} editing={null} onSave={handleSave} onError={(m) => notify(m, 'error')} />
        <div className={`storage${usagePct > 80 ? ' warn' : ''}`} title="Approximate browser storage used">
          <div className="storage-bar">
            <span style={{ width: `${usagePct}%` }} />
          </div>
          <span className="muted">Storage: {(usage / 1024 / 1024).toFixed(1)} MB of ~5 MB</span>
        </div>
      </aside>

      <div className="content">
        <div className="summary">
          <Stat label="All-time total" value={formatMoney(grand.total)} />
          <Stat label="All-time VAT" value={formatMoney(grand.vat)} />
          <Stat label="Receipts" value={String(grand.count)} />
        </div>

        {years.length === 0 ? (
          <div className="card empty">
            <h3>No receipts yet</h3>
            <p className="muted">Add your first receipt using the form. It’ll appear here grouped by month.</p>
          </div>
        ) : (
          <>
            <div className="tabs" role="tablist" aria-label="View">
              {(['monthly', 'quarterly'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={`tab${view === v ? ' active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'monthly' ? 'Monthly' : 'Quarterly review'}
                </button>
              ))}
            </div>
            {view === 'quarterly' ? (
              <QuarterlyReview
                receipts={receipts}
                stagger={stagger}
                onStaggerChange={setStagger}
                onExport={exportList}
              />
            ) : (
              years.map((y) => (
                <section key={y.year} className="year-group" aria-label={y.year}>
                  <YearHeader year={y.year} receipts={y.receipts} />
                  {y.months.map((m) => (
                    <MonthSection
                      key={m.key}
                      monthKey={m.key}
                      receipts={m.receipts}
                      defaultOpen={m.key === newestMonth}
                      editingId={editing?.id}
                      onEdit={setEditing}
                      onDelete={handleDelete}
                      onViewImage={setViewing}
                      onExport={exportList}
                    />
                  ))}
                </section>
              ))
            )}
          </>
        )}
      </div>

      {editing && (
        <EditReceiptModal
          key={editing.id}
          receipt={editing}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          onError={(m) => notify(m, 'error')}
        />
      )}

      {viewing?.image && <ImageModal receipt={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
