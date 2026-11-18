import { useMemo, useState } from 'react';
import { emptyFilters, type MonthFilters, type Receipt, type SortDir, type SortField } from '../types';
import { formatDate, formatMoney, formatMonthKey } from '../lib/format';
import { activeFilterCount, applyFilters, sortReceipts, sumTotals } from '../lib/receipts';
import { VAT_RATES, vatRateInfo, type VatRate } from '../lib/vatRates';
import type { ExportFormat } from '../lib/export';
import { ExportMenu } from './ExportMenu';
import { useAppData } from '../appData';
import { catVar } from '../lib/color';

interface Props {
  monthKey: string;
  receipts: Receipt[];
  defaultOpen: boolean;
  editingId?: string;
  onEdit: (r: Receipt) => void;
  onDelete: (r: Receipt) => void;
  onViewImage: (r: Receipt) => void;
  onExport: (receipts: Receipt[], format: ExportFormat, label: string) => void;
  /** Select mode: rows show a checkbox and a click toggles them instead of opening the editor. */
  selection?: { selected: Set<string>; toggle: (r: Receipt) => void };
}

const SORT_LABELS: Record<SortField, string> = {
  date: 'Date',
  total: 'Price',
  vat: 'VAT',
  name: 'Name (A–Z)',
};

export function MonthSection({
  monthKey,
  receipts,
  defaultOpen,
  editingId,
  onEdit,
  onDelete,
  onViewImage,
  onExport,
  selection,
}: Props) {
  const { categoryColor } = useAppData();
  const [open, setOpen] = useState(defaultOpen);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filters, setFilters] = useState<MonthFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  const monthTotals = useMemo(() => sumTotals(receipts), [receipts]);
  const categories = useMemo(() => [...new Set(receipts.map((r) => r.category))].sort(), [receipts]);
  // Only offer rates this month actually has, in the usual order.
  const rates = useMemo(() => VAT_RATES.filter((v) => receipts.some((r) => r.vatRate === v.id)), [receipts]);
  const visible = useMemo(
    () => sortReceipts(applyFilters(receipts, filters), sortField, sortDir),
    [receipts, filters, sortField, sortDir],
  );
  const visibleTotals = useMemo(() => sumTotals(visible), [visible]);
  const nFilters = activeFilterCount(filters);
  const title = formatMonthKey(monthKey);
  const [y, m] = monthKey.split('-').map(Number);
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  const setF = <K extends keyof MonthFilters>(k: K, v: MonthFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleCategory = (c: string) =>
    setF('categories', filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c]);
  const toggleRate = (r: VatRate) =>
    setF('vatRates', filters.vatRates.includes(r) ? filters.vatRates.filter((x) => x !== r) : [...filters.vatRates, r]);

  return (
    <section className={`card month${open ? ' open' : ''}`}>
      <button type="button" className="month-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg className="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
        <div className="month-title">
          <h3>{title}</h3>
          <span className="muted">
            {monthTotals.count} receipt{monthTotals.count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="month-totals">
          <div>
            <span className="muted">Total</span>
            <strong>{formatMoney(monthTotals.total)}</strong>
          </div>
          <div>
            <span className="muted">VAT</span>
            <strong>{formatMoney(monthTotals.vat)}</strong>
          </div>
          <div className="hide-sm">
            <span className="muted">Net</span>
            <strong>{formatMoney(monthTotals.net)}</strong>
          </div>
        </div>
      </button>

      {open && (
        <div className="month-body">
          <div className="toolbar">
            <div className="toolbar-group">
              <label className="inline-label" htmlFor={`sort-${monthKey}`}>
                Sort
              </label>
              <select id={`sort-${monthKey}`} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
                  <option key={f} value={f}>
                    {SORT_LABELS[f]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                aria-label={`Sort ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="toolbar-group">
              <button
                type="button"
                className={`btn btn-ghost btn-sm${showFilters || nFilters ? ' active' : ''}`}
                onClick={() => setShowFilters((s) => !s)}
                aria-expanded={showFilters}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 5h18l-7 8v6l-4 2v-8z" />
                </svg>
                Filter{nFilters ? ` (${nFilters})` : ''}
              </button>
              <ExportMenu
                small
                disabled={!visible.length}
                label={nFilters ? 'Export filtered' : 'Export'}
                onExport={(fmt) => onExport(visible, fmt, `receipts-${monthKey}`)}
              />
            </div>
          </div>

          {showFilters && (
            <div className="filters">
              <RangeFilter label="Price (£)" min={filters.minTotal} max={filters.maxTotal}
                onMin={(v) => setF('minTotal', v)} onMax={(v) => setF('maxTotal', v)} />
              <RangeFilter label="VAT (£)" min={filters.minVat} max={filters.maxVat}
                onMin={(v) => setF('minVat', v)} onMax={(v) => setF('maxVat', v)} />
              <div className="filter">
                <span className="field-label">Date</span>
                <div className="range">
                  <input type="date" min={monthStart} max={monthEnd} value={filters.dateFrom}
                    onChange={(e) => setF('dateFrom', e.target.value)} aria-label="From date" />
                  <span className="muted">–</span>
                  <input type="date" min={monthStart} max={monthEnd} value={filters.dateTo}
                    onChange={(e) => setF('dateTo', e.target.value)} aria-label="To date" />
                </div>
              </div>
              <div className="filter filter-wide">
                <span className="field-label">Category</span>
                <div className="chips">
                  {categories.map((c) => (
                    <button key={c} type="button"
                      className={`chip${filters.categories.includes(c) ? ' selected' : ''}`}
                      aria-pressed={filters.categories.includes(c)}
                      onClick={() => toggleCategory(c)}>
                      <span className="dot" style={catVar(categoryColor(c))} aria-hidden />
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {rates.length > 1 && (
                <div className="filter filter-wide">
                  <span className="field-label">VAT rate</span>
                  <div className="chips">
                    {rates.map((r) => (
                      <button key={r.id} type="button"
                        className={`chip${filters.vatRates.includes(r.id) ? ' selected' : ''}`}
                        aria-pressed={filters.vatRates.includes(r.id)}
                        onClick={() => toggleRate(r.id)}>
                        {r.short}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {nFilters > 0 && (
                <button type="button" className="link-btn" onClick={() => setFilters(emptyFilters)}>
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {nFilters > 0 && (
            <p className="filter-summary">
              Showing <strong>{visible.length}</strong> of {receipts.length} ·{' '}
              <strong>{formatMoney(visibleTotals.total)}</strong> total ·{' '}
              <strong>{formatMoney(visibleTotals.vat)}</strong> VAT
            </p>
          )}

          {visible.length === 0 ? (
            <p className="empty-small">No receipts match these filters.</p>
          ) : (
            <ul className="receipt-list">
              {visible.map((r) => (
                <li
                  key={r.id}
                  className={`receipt clickable${editingId === r.id ? ' editing' : ''}${selection?.selected.has(r.id) ? ' selected' : ''}`}
                  title={selection ? 'Click to select' : 'Click to edit'}
                  onClick={(e) => {
                    // Thumbnail / edit / delete buttons and the checkbox handle their own clicks.
                    if ((e.target as HTMLElement).closest('button, a, input')) return;
                    if (selection) selection.toggle(r);
                    else onEdit(r);
                  }}
                >
                  {selection && (
                    <input
                      type="checkbox"
                      className="receipt-check"
                      checked={selection.selected.has(r.id)}
                      onChange={() => selection.toggle(r)}
                      aria-label={`Select ${r.name}`}
                    />
                  )}
                  {r.image ? (
                    <button type="button" className="thumb" onClick={() => onViewImage(r)} aria-label={`View receipt image for ${r.name}`}>
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
                      <span className="tag" style={catVar(categoryColor(r.category))}>{r.category}</span>
                      <span className="muted">{formatDate(r.date)}</span>
                    </span>
                  </div>
                  <div className="receipt-amounts">
                    <strong>{formatMoney(r.total)}</strong>
                    <span className="muted">
                      {r.vatRate === 'standard' ? `VAT ${formatMoney(r.vat)}` : r.vatRate === 'reduced' ? `VAT ${formatMoney(r.vat)} (5%)` : vatRateInfo(r.vatRate).short}
                    </span>
                  </div>
                  <div className="receipt-actions">
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => onEdit(r)} aria-label={`Edit ${r.name}`} title="Edit">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon danger" onClick={() => onDelete(r)} aria-label={`Delete ${r.name}`} title="Delete">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function RangeFilter({
  label, min, max, onMin, onMax,
}: {
  label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void;
}) {
  return (
    <div className="filter">
      <span className="field-label">{label}</span>
      <div className="range">
        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Min" value={min}
          onChange={(e) => onMin(e.target.value)} aria-label={`${label} minimum`} />
        <span className="muted">–</span>
        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Max" value={max}
          onChange={(e) => onMax(e.target.value)} aria-label={`${label} maximum`} />
      </div>
    </div>
  );
}
