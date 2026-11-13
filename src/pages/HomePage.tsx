import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Receipt } from '../types';
import { useAppData } from '../appData';
import { formatDate, formatMoney, todayIso } from '../lib/format';
import { sumTotals } from '../lib/receipts';
import { categoryBreakdown, quarterEndExclusive, recentQuarters } from '../lib/quarters';
import { QuarterChart } from '../components/QuarterChart';
import { ImageModal } from '../components/ImageModal';
import { EditReceiptModal } from '../components/EditReceiptModal';

type Period = 'quarter' | 'year' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];
const MAX_CATEGORIES = 8;
const TOP_BILLS = 5;

export function HomePage() {
  const { receipts, stagger, categories: allCategories, saveReceipt, notify } = useAppData();
  const [period, setPeriod] = useState<Period>('quarter');
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);

  const quarters = useMemo(() => recentQuarters(receipts, stagger, today), [receipts, stagger, today]);
  const current = quarters[quarters.length - 1];
  const previous = quarters[quarters.length - 2];
  const qt = sumTotals(current.receipts);
  const prevTotal = sumTotals(previous.receipts).total;
  const change = prevTotal ? ((qt.total - prevTotal) / prevTotal) * 100 : null;
  const daysLeft = Math.ceil((quarterEndExclusive(current.start).getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000);

  const ytd = useMemo(() => sumTotals(receipts.filter((r) => r.date.startsWith(year))), [receipts, year]);

  const periodReceipts = useMemo(
    () =>
      period === 'quarter' ? current.receipts : period === 'year' ? receipts.filter((r) => r.date.startsWith(year)) : receipts,
    [period, current.receipts, receipts, year],
  );
  const periodTotal = sumTotals(periodReceipts).total;

  const categories = useMemo(() => {
    const all = categoryBreakdown(periodReceipts);
    if (all.length <= MAX_CATEGORIES) return all;
    // Fold the long tail into one row rather than inventing more rows.
    const head = all.slice(0, MAX_CATEGORIES - 1);
    const tail = all.slice(MAX_CATEGORIES - 1);
    return [
      ...head,
      tail.reduce(
        (acc, c) => ({ ...acc, count: acc.count + c.count, total: acc.total + c.total, vat: acc.vat + c.vat }),
        { category: `${tail.length} other categories`, count: 0, total: 0, vat: 0 },
      ),
    ];
  }, [periodReceipts]);
  const maxCat = categories[0]?.total ?? 0;

  const biggest = useMemo(
    () => [...periodReceipts].sort((a, b) => b.total - a.total).slice(0, TOP_BILLS),
    [periodReceipts],
  );

  const periodName = PERIODS.find((p) => p.value === period)!.label.toLowerCase();

  if (!receipts.length) {
    return (
      <main className="page">
        <div className="card empty welcome">
          <h2>Welcome to your bookkeeping</h2>
          <p className="muted">Once you add receipts, this page shows your VAT quarters, spending by category and biggest bills.</p>
          <Link to="/receipts" className="btn btn-primary">
            Add your first receipt
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p className="muted">
            Current VAT quarter: <strong>{current.label === current.range ? current.range : `${current.label} (${current.range})`}</strong>
            {' · '}
            {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </p>
        </div>
        <Link to="/receipts" className="btn btn-primary">
          + Add receipt
        </Link>
      </div>

      <div className="tiles">
        <div className="stat">
          <span className="muted">Spend this quarter</span>
          <strong>{formatMoney(qt.total)}</strong>
          <small className="muted">
            {change === null ? `${qt.count} receipt${qt.count === 1 ? '' : 's'}` : (
              <>
                <span className={change > 0 ? 'trend-up' : 'trend-down'}>
                  {change > 0 ? '▲' : change < 0 ? '▼' : '■'} {Math.abs(change).toFixed(0)}%
                </span>{' '}
                vs last quarter
              </>
            )}
          </small>
        </div>
        <div className="stat stat-accent">
          <span className="muted">VAT paid this quarter</span>
          <strong>{formatMoney(qt.vat)}</strong>
          <small className="muted">For your next VAT return</small>
        </div>
        <div className="stat">
          <span className="muted">Spend in {year}</span>
          <strong>{formatMoney(ytd.total)}</strong>
          <small className="muted">{ytd.count} receipts</small>
        </div>
        <div className="stat">
          <span className="muted">VAT paid in {year}</span>
          <strong>{formatMoney(ytd.vat)}</strong>
          <small className="muted">Net {formatMoney(ytd.net)}</small>
        </div>
      </div>

      <QuarterChart quarters={quarters} stagger={stagger} />

      <div className="tabs" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            className={`tab${period === p.value ? ' active' : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="home-grid">
        <section className="card panel">
          <header className="chart-head">
            <div>
              <h3>Spend by category</h3>
              <span className="muted">
                {formatMoney(periodTotal)} {periodName}
              </span>
            </div>
          </header>
          {categories.length === 0 ? (
            <p className="empty-small">No receipts {periodName} yet.</p>
          ) : (
            <ul className="hbars">
              {categories.map((c) => {
                const share = periodTotal ? (c.total / periodTotal) * 100 : 0;
                return (
                  <li key={c.category} title={`${c.count} receipt${c.count === 1 ? '' : 's'} · VAT ${formatMoney(c.vat)}`}>
                    <div className="hbar-label">
                      <span className="hbar-name">{c.category}</span>
                      <span className="hbar-value">
                        <strong>{formatMoney(c.total)}</strong> <span className="muted">{share.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="hbar-track">
                      <span style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }} />
                    </div>
                    <span className="hbar-sub muted">
                      {c.count} receipt{c.count === 1 ? '' : 's'} · VAT {formatMoney(c.vat)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card panel">
          <header className="chart-head">
            <div>
              <h3>Biggest bills</h3>
              <span className="muted">Top {TOP_BILLS} {periodName}</span>
            </div>
            <Link to="/receipts" className="link-btn">
              All receipts →
            </Link>
          </header>
          {biggest.length === 0 ? (
            <p className="empty-small">No receipts {periodName} yet.</p>
          ) : (
            <ol className="bills">
              {biggest.map((r, i) => (
                <li
                  key={r.id}
                  className="clickable"
                  title="Click to edit"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button, a')) setEditing(r);
                  }}
                >
                  <span className="bill-rank">{i + 1}</span>
                  {r.image ? (
                    <button type="button" className="thumb" onClick={() => setViewing(r)} aria-label={`View receipt image for ${r.name}`}>
                      <img src={r.image} alt="" loading="lazy" />
                    </button>
                  ) : (
                    <div className="thumb thumb-empty" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />
                      </svg>
                    </div>
                  )}
                  <div className="receipt-main">
                    <span className="receipt-name">{r.name}</span>
                    <span className="receipt-meta">
                      <span className="tag">{r.category}</span>
                      <span className="muted">{formatDate(r.date)}</span>
                    </span>
                  </div>
                  <div className="receipt-amounts">
                    <strong>{formatMoney(r.total)}</strong>
                    <span className="muted">VAT {formatMoney(r.vat)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {viewing?.image && <ImageModal receipt={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <EditReceiptModal
          key={editing.id}
          receipt={editing}
          categories={allCategories}
          onSave={(r, newCategory) => {
            const ok = saveReceipt(r, newCategory);
            if (ok) setEditing(null);
            return ok;
          }}
          onClose={() => setEditing(null)}
          onError={(m) => notify(m, 'error')}
        />
      )}
    </main>
  );
}
