import { useState } from 'react';
import type { Income } from '../types';
import { useAppData } from '../appData';
import { formatDate, formatMoney, newId, round2, todayIso } from '../lib/format';
import { DEFAULT_VAT_RATE, hasNoVat, VAT_RATES, vatRateInfo, type VatRate } from '../lib/vatRates';
import { LockIcon } from './LockIcon';

interface Props {
  editing: Income | null;
  onDone?: () => void;
}

interface Draft {
  customer: string;
  reference: string;
  description: string;
  net: string;
  vat: string;
  vatRate: VatRate;
  date: string;
}

const blank = (): Draft => ({ customer: '', reference: '', description: '', net: '', vat: '', vatRate: DEFAULT_VAT_RATE, date: todayIso() });
const fromIncome = (i: Income): Draft => ({
  customer: i.customer,
  reference: i.reference ?? '',
  description: i.description ?? '',
  net: i.net.toFixed(2),
  vat: i.vat.toFixed(2),
  vatRate: i.vatRate,
  date: i.date,
});

/** For sales, "outside" means outside the scope of VAT rather than an unregistered supplier. */
const rateLabel = (id: VatRate) => (id === 'outside' ? 'Outside the scope of VAT' : vatRateInfo(id).label);

/** VAT charged on a net amount: net × rate (e.g. £100 at 20% → £20). */
const vatOnNet = (net: number, id: VatRate) => round2(net * (vatRateInfo(id).rate ?? 0));

/** Add or edit an income record: who paid, the invoice number, net amount and VAT. */
export function IncomeForm({ editing, onDone }: Props) {
  const { saveIncome, lockedBy, client } = useAppData();
  const [draft, setDraft] = useState<Draft>(() => (editing ? fromIncome(editing) : blank()));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  const lock = editing ? lockedBy(editing.date) : undefined;
  const noVat = hasNoVat(draft.vatRate);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  /** Typing the net amount keeps VAT in step while it's still the calculated figure. */
  const setNet = (net: string) => {
    const before = Number(draft.net);
    const calculated = draft.vat === '' || Number(draft.vat) === vatOnNet(before, draft.vatRate);
    const n = Number(net);
    set('net', net);
    if (calculated && !noVat) set('vat', net !== '' && !isNaN(n) ? vatOnNet(n, draft.vatRate).toFixed(2) : '');
  };
  const setRate = (rate: VatRate) => {
    const n = Number(draft.net);
    set('vatRate', rate);
    set('vat', hasNoVat(rate) ? '0.00' : draft.net !== '' && !isNaN(n) ? vatOnNet(n, rate).toFixed(2) : '');
  };

  const net = Number(draft.net);
  const vat = noVat || draft.vat.trim() === '' ? 0 : Number(draft.vat);
  const gross = !isNaN(net) && !isNaN(vat) ? net + vat : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || lock) return;
    const errs: typeof errors = {};
    if (!draft.customer.trim()) errs.customer = 'Required';
    if (draft.net.trim() === '' || isNaN(net) || net < 0) errs.net = 'Enter a valid amount';
    if (isNaN(vat) || vat < 0) errs.vat = 'Enter a valid amount';
    if (!draft.date) errs.date = 'Required';
    else if (lockedBy(draft.date)) errs.date = 'That’s in a filed VAT quarter';
    if (Object.keys(errs).length) return setErrors(errs);

    setSaving(true);
    const ok = await saveIncome({
      id: editing?.id ?? newId(),
      clientId: client.id,
      customer: draft.customer.trim(),
      reference: draft.reference.trim() || undefined,
      description: draft.description.trim() || undefined,
      net: round2(net),
      vat: round2(vat),
      vatRate: draft.vatRate,
      date: draft.date,
      createdAt: editing?.createdAt ?? Date.now(),
    });
    setSaving(false);
    if (!ok) return;
    if (editing) onDone?.();
    // Keep the date and rate, handy for entering a batch.
    else setDraft((d) => ({ ...blank(), date: d.date, vatRate: d.vatRate }));
  };

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Edit income' : 'Add income'}</h2>
        {editing && (
          <button type="button" className="btn btn-ghost btn-icon" onClick={onDone} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      {lock && (
        <p className="locked-note">
          <LockIcon />
          <span>
            This is in a VAT quarter filed on {formatDate(lock.filedAt.slice(0, 10))}, so it can’t be changed. To edit it, unfile the quarter
            in the quarterly review.
          </span>
        </p>
      )}

      <fieldset className="form-fields" disabled={Boolean(lock)}>
        <div className="row-2">
          <Field label="Customer" error={errors.customer}>
            <input type="text" value={draft.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Who paid" autoComplete="off" />
          </Field>
          <Field label="Invoice no. (optional)">
            <input type="text" value={draft.reference} onChange={(e) => set('reference', e.target.value)} placeholder="e.g. INV-042" />
          </Field>
        </div>
        <div className="row-2">
          <Field label="Net (ex. VAT)" error={errors.net}>
            <div className="money-input">
              <span>£</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={draft.net} onChange={(e) => setNet(e.target.value)} placeholder="0.00" />
            </div>
          </Field>
          <Field label="VAT charged" error={errors.vat}>
            <div className="money-input">
              <span>£</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={noVat ? '0.00' : draft.vat}
                onChange={(e) => set('vat', e.target.value)}
                placeholder="0.00"
                disabled={noVat}
              />
            </div>
          </Field>
        </div>
        <div className="row-2">
          <Field label="VAT rate">
            <select value={draft.vatRate} onChange={(e) => setRate(e.target.value as VatRate)}>
              {VAT_RATES.map((r) => (
                <option key={r.id} value={r.id}>
                  {rateLabel(r.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" error={errors.date}>
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <Field label="Description (optional)">
          <input type="text" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Website design, October" />
        </Field>
        {gross > 0 && (
          <span className="field-hint">
            Invoice total <strong>{formatMoney(gross)}</strong>
          </span>
        )}
      </fieldset>

      {lock ? (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Close
          </button>
        </div>
      ) : editing ? (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : (
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Add income'}
        </button>
      )}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
