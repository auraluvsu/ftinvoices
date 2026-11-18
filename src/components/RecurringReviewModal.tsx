import { useState } from 'react';
import type { RecurringExpense } from '../types';
import { useAppData } from '../appData';
import { formatDate, round2 } from '../lib/format';
import { frequencyLabel } from '../lib/recurring';
import { hasNoVat, vatFromGross } from '../lib/vatRates';
import { Modal } from './Modal';

interface Entry {
  date: string;
  add: boolean;
  total: string;
  vat: string;
}

/** Lists every due date of every due recurring expense, prefilled, to tick and adjust before adding. */
export function RecurringReviewModal({ onClose }: { onClose: () => void }) {
  const { dueRecurring, applyRecurring, notify, lockedBy } = useAppData();
  // Snapshot of what was due when opened, so rows don't vanish while being reviewed.
  const [due] = useState(dueRecurring);
  const [entries, setEntries] = useState<Record<string, Entry[]>>(() =>
    Object.fromEntries(
      due.map(({ expense, dates }) => [
        expense.id,
        dates.map((date) => ({
          date,
          // A date in a filed quarter can't be added, only skipped.
          add: !lockedBy(date),
          total: expense.total.toFixed(2),
          vat: expense.vat.toFixed(2),
        })),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);

  const update = (id: string, i: number, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [id]: prev[id].map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  /** Editing the total recalculates VAT at the expense's rate, if VAT was the calculated amount. */
  const setTotal = (expense: RecurringExpense, i: number, e: Entry, total: string) => {
    const before = Number(e.total);
    const calculated = Number(e.vat) === vatFromGross(before, expense.vatRate);
    const t = Number(total);
    update(expense.id, i, { total, ...(calculated && total !== '' && !isNaN(t) ? { vat: vatFromGross(t, expense.vatRate).toFixed(2) } : {}) });
  };

  const parsed = (e: Entry) => ({ total: Number(e.total), vat: e.vat.trim() === '' ? 0 : Number(e.vat) });
  const invalid = (e: Entry) => {
    if (!e.add) return false;
    const { total, vat } = parsed(e);
    return e.total.trim() === '' || isNaN(total) || total < 0 || isNaN(vat) || vat < 0 || vat > total;
  };
  const all = Object.values(entries).flat();
  const adding = all.filter((e) => e.add).length;
  const hasErrors = all.some(invalid);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy || hasErrors) return;
    setBusy(true);
    let added = 0;
    let skipped = 0;
    for (const { expense } of due) {
      const list = entries[expense.id].map((e) => ({ date: e.date, add: e.add, ...parsed(e) }));
      const rounded = list.map((e) => ({ ...e, total: round2(e.total), vat: hasNoVat(expense.vatRate) ? 0 : round2(e.vat) }));
      if (await applyRecurring(expense, rounded)) {
        added += rounded.filter((e) => e.add).length;
        skipped += rounded.filter((e) => !e.add).length;
      }
    }
    setBusy(false);
    if (added || skipped)
      notify(
        [added && `Added ${added} recurring receipt${added === 1 ? '' : 's'}`, skipped && `skipped ${skipped}`].filter(Boolean).join(', '),
      );
    onClose();
  };

  return (
    <Modal label="Recurring expenses due" onClose={onClose} closeOnBackdrop={false} className="modal-form modal-wide">
      <form className="card form" onSubmit={submit} noValidate>
        <div className="card-head">
          <h2>Recurring expenses due</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted">Check the amounts, untick any you don’t want, then add them. Unticked ones are skipped.</p>

        {due.map(({ expense }) => (
          <fieldset key={expense.id} className="recurring-group">
            <legend>
              <strong>{expense.name}</strong> <span className="muted">· {frequencyLabel(expense.frequency)}</span>
            </legend>
            {entries[expense.id].map((e, i) => {
              const lock = lockedBy(e.date);
              return (
                <div key={e.date} className={`recurring-row${e.add ? '' : ' off'}${invalid(e) ? ' has-error' : ''}`}>
                  <label className="recurring-date">
                    <input
                      type="checkbox"
                      checked={e.add}
                      disabled={Boolean(lock)}
                      onChange={() => update(expense.id, i, { add: !e.add })}
                      aria-label={`Add ${expense.name} on ${formatDate(e.date)}`}
                    />
                    {formatDate(e.date)}
                  </label>
                  {lock ? (
                    <span className="muted recurring-locked">In a filed quarter, skipped</span>
                  ) : (
                    <>
                      <div className="money-input">
                        <span>£</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={e.total}
                          disabled={!e.add}
                          onChange={(ev) => setTotal(expense, i, e, ev.target.value)}
                          aria-label={`Total for ${expense.name} on ${formatDate(e.date)}`}
                        />
                      </div>
                      <div className="money-input">
                        <span>VAT £</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={hasNoVat(expense.vatRate) ? '0.00' : e.vat}
                          disabled={!e.add || hasNoVat(expense.vatRate)}
                          onChange={(ev) => update(expense.id, i, { vat: ev.target.value })}
                          aria-label={`VAT for ${expense.name} on ${formatDate(e.date)}`}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
        {hasErrors && <p className="field-error">Check the highlighted amounts: VAT can’t be more than the total.</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Later
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || hasErrors}>
            {busy ? 'Saving…' : adding ? `Add ${adding} receipt${adding === 1 ? '' : 's'}` : 'Skip all'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
