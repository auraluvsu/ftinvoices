import { useState } from 'react';
import type { Receipt } from '../types';
import { useAppData } from '../appData';
import { formatMoney } from '../lib/format';
import { sumTotals } from '../lib/receipts';
import { ExportMenu } from './ExportMenu';

interface Props {
  selected: Receipt[];
  /** Everything currently shown (all receipts, or the search results). */
  shown: Receipt[];
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}

/** Actions for the receipts picked in select mode: move to a category, export or delete. */
export function BulkBar({ selected, shown, onSelectAll, onClear, onDone }: Props) {
  const { categories, moveReceipts, deleteReceipts, exportList } = useAppData();
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const t = sumTotals(selected);
  const none = selected.length === 0;

  const move = async () => {
    if (!category || none) return;
    setBusy(true);
    if (await moveReceipts(selected, category)) setCategory('');
    setBusy(false);
  };

  return (
    <div className="bulk-bar" role="region" aria-label="Selected receipts">
      <div className="bulk-count">
        <strong>{selected.length} selected</strong>
        {!none && <span className="muted"> · {formatMoney(t.total)}</span>}
        <span className="bulk-links">
          {selected.length < shown.length && (
            <button type="button" className="link-btn" onClick={onSelectAll}>
              Select all {shown.length}
            </button>
          )}
          {!none && (
            <button type="button" className="link-btn" onClick={onClear}>
              Clear
            </button>
          )}
        </span>
      </div>
      <div className="bulk-actions">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Move to category" disabled={none || busy}>
          <option value="">Move to…</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={move} disabled={!category || none || busy}>
          Move
        </button>
        <ExportMenu small label="Export" disabled={none} onExport={(fmt) => exportList(selected, fmt, 'selected')} />
        <button
          type="button"
          className="btn btn-secondary btn-sm danger"
          disabled={none || busy}
          onClick={() => {
            deleteReceipts(selected);
            onClear();
          }}
        >
          Delete
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
