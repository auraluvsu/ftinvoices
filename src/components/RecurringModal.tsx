import { useState } from 'react';
import type { RecurringExpense } from '../types';
import { useAppData } from '../appData';
import { catVar } from '../lib/color';
import { formatDate, formatMoney } from '../lib/format';
import { frequencyLabel } from '../lib/recurring';
import { vatRateInfo } from '../lib/vatRates';
import { Modal } from './Modal';

/** Lists the open client's recurring expenses, with the next date of each and a way to stop one. */
export function RecurringModal({ onClose }: { onClose: () => void }) {
  const { recurring, categoryList, categoryColor, deleteRecurring } = useAppData();
  const [confirming, setConfirming] = useState<string | null>(null);
  const categoryName = (r: RecurringExpense) => categoryList.find((c) => c.id === r.categoryId)?.name ?? 'Other';

  return (
    <Modal label="Recurring expenses" onClose={onClose} className="modal-form modal-wide">
      <div className="card form">
        <div className="card-head">
          <h2>Recurring expenses</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {recurring.length === 0 ? (
          <p className="muted">
            None yet. When adding a receipt for something you pay regularly, choose how often it repeats, and you’ll be asked to add it
            again each time it’s due.
          </p>
        ) : (
          <ul className="recurring-list">
            {recurring.map((r) => (
              <li key={r.id}>
                <span className="grow">
                  <strong>{r.name}</strong>
                  <span className="muted">
                    {formatMoney(r.total)}
                    {r.vatRate === 'standard' ? '' : ` · ${vatRateInfo(r.vatRate).short}`} · {frequencyLabel(r.frequency)} · next{' '}
                    {formatDate(r.nextDate)}
                  </span>
                </span>
                <span className="tag" style={catVar(categoryColor(categoryName(r)))}>
                  {categoryName(r)}
                </span>
                {confirming === r.id ? (
                  <span className="recurring-banner-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        if (await deleteRecurring(r)) setConfirming(null);
                      }}
                    >
                      Stop repeating
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(r.id)} aria-label={`Stop ${r.name} repeating`}>
                    Stop
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">Stopping one keeps the receipts already added.</p>
      </div>
    </Modal>
  );
}
