import { useMemo, useState } from 'react';
import type { NewCategory, Receipt, ReceiptDraft } from '../types';
import { useAppData } from '../appData';
import { groupByMonth, groupByYear, searchReceipts, sumTotals } from '../lib/receipts';
import { formatMoney } from '../lib/format';
import { ReceiptForm } from '../components/ReceiptForm';
import { MonthSection } from '../components/MonthSection';
import { YearHeader } from '../components/YearHeader';
import { QuarterlyReview } from '../components/QuarterlyReview';
import { ImageModal } from '../components/ImageModal';
import { EditReceiptModal } from '../components/EditReceiptModal';
import { Stat } from '../components/Stat';

const VIEW_KEY = 'ftinvoices.view';
type View = 'monthly' | 'quarterly';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'quarterly' ? 'quarterly' : 'monthly';
  } catch {
    return 'monthly';
  }
}

export function ReceiptsPage() {
  const { receipts, categories, stagger, openClientSettings, saveReceipt, deleteReceipt, exportList, notify } = useAppData();
  const [view, setViewState] = useState<View>(readView);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [viewing, setViewing] = useState<Receipt | null>(null);

  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const shown = useMemo(() => searchReceipts(receipts, query), [receipts, query]);
  const shownTotals = useMemo(() => sumTotals(shown), [shown]);

  const years = useMemo(() => groupByYear(groupByMonth(shown)), [shown]);
  const newestMonth = years[0]?.months[0]?.key;
  const grand = useMemo(() => sumTotals(receipts), [receipts]);

  const handleSave = async (draft: ReceiptDraft, newCategory?: NewCategory) => {
    const ok = await saveReceipt(draft, newCategory);
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
      </aside>

      <div className="content">
        <div className="summary">
          <Stat label="All-time total" value={formatMoney(grand.total)} />
          <Stat label="All-time VAT" value={formatMoney(grand.vat)} />
          <Stat label="Receipts" value={String(grand.count)} />
        </div>

        {receipts.length > 0 && (
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search all receipts — name, category or amount"
              aria-label="Search all receipts"
            />
            {searching && (
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setQuery('')} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
        )}
        {searching && (
          <p className="filter-summary" role="status">
            <strong>{shownTotals.count}</strong> result{shownTotals.count === 1 ? '' : 's'}
            {shownTotals.count > 0 && (
              <>
                {' '}· <strong>{formatMoney(shownTotals.total)}</strong> total · <strong>{formatMoney(shownTotals.vat)}</strong> VAT
              </>
            )}
          </p>
        )}

        {searching && shown.length === 0 ? (
          <div className="card empty">
            <h3>No matches</h3>
            <p className="muted">Nothing matches “{query.trim()}”. Try a supplier, a category or an amount like 49.99.</p>
          </div>
        ) : years.length === 0 ? (
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
                receipts={shown}
                stagger={stagger}
                onEditSettings={openClientSettings}
                onExport={exportList}
              />
            ) : (
              years.map((y) => (
                <section key={y.year} className="year-group" aria-label={y.year}>
                  <YearHeader year={y.year} receipts={y.receipts} />
                  {y.months.map((m) => (
                    <MonthSection
                      // Remount when search starts/stops so matching months open automatically.
                      key={`${m.key}-${searching}`}
                      monthKey={m.key}
                      receipts={m.receipts}
                      defaultOpen={searching || m.key === newestMonth}
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
