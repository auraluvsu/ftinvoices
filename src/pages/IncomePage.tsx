import { useMemo, useState } from 'react';
import type { Income } from '../types';
import { useAppData } from '../appData';
import { formatDate, formatMoney, formatMonthKey, monthKey } from '../lib/format';
import { exportIncome } from '../lib/export';
import { vatRateInfo } from '../lib/vatRates';
import { IncomeForm } from '../components/IncomeForm';
import { LockIcon } from '../components/LockIcon';
import { Modal } from '../components/Modal';
import { Stat } from '../components/Stat';

const sum = (list: Income[]) => list.reduce((t, i) => ({ net: t.net + i.net, vat: t.vat + i.vat }), { net: 0, vat: 0 });

/** Money in: add income from your invoices and see it month by month. */
export function IncomePage() {
  const { income, receipts, deleteIncome, lockedBy, client, notify } = useAppData();
  const [editing, setEditing] = useState<Income | null>(null);

  const months = useMemo(() => {
    const map = new Map<string, Income[]>();
    for (const i of [...income].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)) {
      const k = monthKey(i.date);
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    return [...map.entries()];
  }, [income]);

  const all = sum(income);
  const spentNet = receipts.reduce((n, r) => n + r.total - r.vat, 0);

  return (
    <main className="layout">
      <aside className="sidebar">
        <IncomeForm editing={null} />
      </aside>

      <div className="content">
        <div className="summary">
          <Stat label="All-time income (ex. VAT)" value={formatMoney(all.net)} />
          <Stat label="VAT charged" value={formatMoney(all.vat)} />
          <Stat label="Profit (ex. VAT)" value={formatMoney(all.net - spentNet)} hint="Income minus spending, before tax" />
        </div>

        {income.length === 0 ? (
          <div className="card empty">
            <h3>No income yet</h3>
            <p className="muted">
              Add what you’ve invoiced using the form. It’s used for profit figures and the sales boxes (1 and 6) of the VAT return.
            </p>
          </div>
        ) : (
          <>
            <div className="view-row">
              <span />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  try {
                    exportIncome(income, 'income', { client: client.name, vatNumber: client.vatNumber });
                  } catch (e) {
                    notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
                  }
                }}
              >
                Export CSV
              </button>
            </div>
            {months.map(([key, list]) => {
              const t = sum(list);
              return (
                <section key={key} className="card income-month" aria-label={formatMonthKey(key)}>
                  <header className="income-month-head">
                    <h3>{formatMonthKey(key)}</h3>
                    <span className="muted">
                      {formatMoney(t.net)} net · VAT {formatMoney(t.vat)}
                    </span>
                  </header>
                  <ul className="receipt-list">
                    {list.map((i) => {
                      const lock = lockedBy(i.date);
                      return (
                        <li key={i.id} className="receipt">
                          <div className="receipt-main">
                            <span className="receipt-name">{i.customer}</span>
                            <span className="receipt-meta">
                              {i.reference && <span className="tag-plain">{i.reference}</span>}
                              <span className="muted">{formatDate(i.date)}</span>
                              {i.description && <span className="muted">· {i.description}</span>}
                            </span>
                          </div>
                          <div className="receipt-amounts">
                            <strong>{formatMoney(i.net)}</strong>
                            <span className="muted">
                              {i.vatRate === 'standard' || i.vatRate === 'reduced'
                                ? `VAT ${formatMoney(i.vat)}${i.vatRate === 'reduced' ? ' (5%)' : ''}`
                                : i.vatRate === 'outside'
                                  ? 'Outside scope'
                                  : vatRateInfo(i.vatRate).short}
                            </span>
                          </div>
                          <div className="receipt-actions">
                            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditing(i)} aria-label={`Edit ${i.customer}`} title="Edit">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                              </svg>
                            </button>
                            {lock ? (
                              <span className="receipt-lock" role="img" aria-label={`${i.customer} is in a filed VAT quarter`} title="In a filed VAT quarter">
                                <LockIcon size={15} />
                              </span>
                            ) : (
                              <button type="button" className="btn btn-ghost btn-icon danger" onClick={() => deleteIncome(i)} aria-label={`Delete ${i.customer}`} title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>

      {editing && (
        <Modal label={`Edit ${editing.customer}`} onClose={() => setEditing(null)} closeOnBackdrop={false} className="modal-form">
          <IncomeForm key={editing.id} editing={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}
