import { useId, useMemo, useRef, useState } from 'react';
import type { NewCategory, Receipt, ReceiptDraft } from '../types';
import { useAppData } from '../appData';
import { formatDate, formatMoney, newId, round2, todayIso } from '../lib/format';
import { catVar, SUGGESTED_COLORS } from '../lib/color';
import { supplierMemory } from '../lib/receipts';
import { findDuplicate } from '../lib/duplicates';
import { urlToDataUrl } from '../lib/image';
import { scanReceipt } from '../lib/db';
import { mergeScan } from '../lib/scan';
import { ImageInput } from './ImageInput';
import { CategoryColorPicker } from './CategoryColorPicker';
import { ScanUnavailableError } from '../lib/db';
import { markScanUnavailable, scanAvailable } from '../lib/scanAvailability';
import { DEFAULT_VAT_RATE, hasNoVat, VAT_RATES, vatFromGross, vatRateInfo, type VatRate } from '../lib/vatRates';

const NEW_CATEGORY = '__new__';

interface Props {
  categories: string[];
  editing: Receipt | null;
  onSave: (draft: ReceiptDraft, newCategory?: NewCategory) => Promise<boolean>;
  onCancelEdit?: () => void;
  onError: (msg: string) => void;
}

interface Draft {
  name: string;
  total: string;
  vat: string;
  vatRate: VatRate;
  category: string;
  newCategory: string;
  newColor: string;
  date: string;
  image?: string;
}

const blank = (category = ''): Draft => ({
  name: '',
  total: '',
  vat: '',
  vatRate: DEFAULT_VAT_RATE,
  category,
  newCategory: '',
  newColor: '',
  date: todayIso(),
  image: undefined,
});

const fromReceipt = (r: Receipt): Draft => ({
  name: r.name,
  total: r.total.toFixed(2),
  vat: r.vat.toFixed(2),
  vatRate: r.vatRate,
  category: r.category,
  newCategory: '',
  newColor: '',
  date: r.date,
  image: r.image,
});

export function ReceiptForm({ categories, editing, onSave, onCancelEdit, onError }: Props) {
  // The parent remounts this form (via `key`) when switching between add/edit.
  const [draft, setDraft] = useState<Draft>(() => (editing ? fromReceipt(editing) : blank(categories[0])));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  // Possible duplicate found on submit; "Save anyway" skips the check once. A ref, because the
  // button's click and the form's submit happen in the same tick, before state would update.
  const [duplicateOf, setDuplicateOf] = useState<Receipt | null>(null);
  const allowDuplicate = useRef(false);
  const { categoryColor, receipts } = useAppData();
  // Supplier memory: typing a known name picks the category last used for it,
  // unless the category has been chosen by hand.
  const suppliers = useMemo(() => supplierMemory(receipts), [receipts]);
  const supplierList = useMemo(
    () => [...suppliers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [suppliers],
  );
  const [categoryTouched, setCategoryTouched] = useState(Boolean(editing));
  const [rateTouched, setRateTouched] = useState(Boolean(editing));
  const [remembered, setRemembered] = useState<string | null>(null);
  const listId = useId();

  // Receipt scanning: fills only the fields that are still empty, then highlights them.
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(scanAvailable);
  const [scanned, setScanned] = useState<Set<keyof Draft>>(() => new Set());
  const scan = async () => {
    if (!draft.image || scanning) return;
    setScanning(true);
    try {
      const r = await scanReceipt(await urlToDataUrl(draft.image), categories);
      const { patch, remembered } = mergeScan(draft, r, {
        today: todayIso(),
        categories,
        keepCategory: categoryTouched || draft.category === NEW_CATEGORY,
        rememberedCategory: (key) => suppliers.get(key)?.category,
      });
      if (remembered) setRemembered(remembered);
      const keys = Object.keys(patch) as (keyof Draft)[];
      if (!keys.length) {
        onError(r.total == null && !r.name ? 'Couldn’t read anything from this image' : 'Nothing new to fill in — the fields are already set');
        return;
      }
      setDraft((d) => ({ ...d, ...patch }));
      setErrors({});
      setScanned(new Set(keys));
      setTimeout(() => setScanned(new Set()), 2500);
    } catch (e) {
      if (e instanceof ScanUnavailableError) {
        markScanUnavailable();
        setCanScan(false);
        onError(e.message);
        return;
      }
      onError(`Couldn’t read the receipt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const onNameChange = (name: string) => {
    set('name', name);
    const hit = suppliers.get(name.trim().toLowerCase());
    if (hit && !categoryTouched && categories.includes(hit.category)) {
      set('category', hit.category);
      setRemembered(hit.category);
    } else if (!hit) {
      setRemembered(null);
    }
    // Same supplier, same VAT treatment (e.g. train tickets are zero-rated).
    if (hit && !rateTouched && hit.vatRate !== draft.vatRate) changeRate(hit.vatRate);
  };
  // Default a new category to the first suggested colour not already in use.
  const usedColors = new Set(categories.map(categoryColor));
  const newColor = draft.newColor || (SUGGESTED_COLORS.find((c) => !usedColors.has(c)) ?? SUGGESTED_COLORS[0]);
  // If the chosen category was renamed, merged or deleted meanwhile, fall back to one that exists.
  const currentCategory =
    draft.category === NEW_CATEGORY || categories.includes(draft.category) ? draft.category : (categories[0] ?? '');
  const selectedColor = currentCategory === NEW_CATEGORY ? newColor : categoryColor(currentCategory);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDuplicateOf(null);
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const calcVat = () => {
    const t = Number(draft.total);
    if (!draft.total || isNaN(t)) {
      setErrors((e) => ({ ...e, total: 'Enter a total first' }));
      return;
    }
    // VAT portion of a VAT-inclusive total, e.g. at 20% = total × 20/120
    set('vat', vatFromGross(t, draft.vatRate).toFixed(2));
  };

  /** Switching rate keeps VAT consistent: 0 for no-VAT rates, recalculated if it was calculated before. */
  const changeRate = (rate: VatRate) => {
    const t = Number(draft.total);
    const wasCalculated = draft.total !== '' && !isNaN(t) && Number(draft.vat) === vatFromGross(t, draft.vatRate);
    set('vatRate', rate);
    if (hasNoVat(rate)) set('vat', '0.00');
    else if (wasCalculated || hasNoVat(draft.vatRate)) set('vat', draft.total !== '' && !isNaN(t) ? vatFromGross(t, rate).toFixed(2) : '');
  };
  const noVat = hasNoVat(draft.vatRate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errs: typeof errors = {};
    const total = Number(draft.total);
    const vat = noVat || draft.vat.trim() === '' ? 0 : Number(draft.vat);
    const isNew = currentCategory === NEW_CATEGORY;
    const category = (isNew ? draft.newCategory : currentCategory).trim();

    if (!draft.name.trim()) errs.name = 'Required';
    if (draft.total.trim() === '' || isNaN(total) || total < 0) errs.total = 'Enter a valid amount';
    if (isNaN(vat) || vat < 0) errs.vat = 'Enter a valid amount';
    else if (!errs.total && vat > total) errs.vat = 'VAT can’t exceed the total';
    if (!category) errs[isNew ? 'newCategory' : 'category'] = 'Required';
    if (!draft.date) errs.date = 'Required';

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const existing = isNew ? categories.find((c) => c.toLowerCase() === category.toLowerCase()) : undefined;
    const finalCategory = existing ?? category;

    const receipt: ReceiptDraft = {
      id: editing?.id ?? newId(),
      name: draft.name.trim(),
      total: round2(total),
      vat: round2(vat),
      vatRate: draft.vatRate,
      category: finalCategory,
      date: draft.date,
      image: draft.image,
    };

    const dup = allowDuplicate.current ? undefined : findDuplicate(receipts, receipt);
    allowDuplicate.current = false;
    if (dup) {
      setDuplicateOf(dup);
      return;
    }
    setDuplicateOf(null);

    setSaving(true);
    const ok = await onSave(receipt, isNew && !existing ? { name: finalCategory, color: newColor } : undefined);
    setSaving(false);
    if (ok && !editing) {
      // Keep the category and date — handy when entering a batch of receipts.
      setDraft((d) => ({ ...blank(finalCategory), date: d.date }));
      setCategoryTouched(false);
      setRateTouched(false);
      setRemembered(null);
    }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Edit receipt' : 'Add receipt'}</h2>
        {editing && (
          <button type="button" className="btn btn-ghost btn-icon" onClick={onCancelEdit} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <Field label="Name" error={errors.name} highlight={scanned.has('name')}>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Tesco, Train to Leeds"
          autoComplete="off"
          list={listId}
        />
        <datalist id={listId}>
          {supplierList.map((sup) => (
            <option key={sup.name} value={sup.name} />
          ))}
        </datalist>
        {remembered && (
          <span className="field-hint">
            Category set to <strong>{remembered}</strong> from your last receipt
          </span>
        )}
      </Field>

      <div className="row-2">
        <Field label="Total (inc. VAT)" error={errors.total} highlight={scanned.has('total')}>
          <div className="money-input">
            <span>£</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={draft.total}
              onChange={(e) => set('total', e.target.value)}
              placeholder="0.00"
            />
          </div>
        </Field>
        <Field
          label="VAT"
          error={errors.vat}
          highlight={scanned.has('vat')}
          action={
            !noVat && (
              <button
                type="button"
                className="link-btn"
                onClick={calcVat}
                title={`Calculate ${vatRateInfo(draft.vatRate).short} VAT from the total`}
              >
                Calc {vatRateInfo(draft.vatRate).short}
              </button>
            )
          }
        >
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
              title={noVat ? 'No VAT at this rate' : undefined}
            />
          </div>
        </Field>
      </div>

      <Field label="VAT rate">
        <select
          value={draft.vatRate}
          onChange={(e) => {
            changeRate(e.target.value as VatRate);
            setRateTouched(true);
          }}
        >
          {VAT_RATES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="row-2">
        <Field label="Category" error={errors.category} highlight={scanned.has('category')}>
          <div className="select-swatch">
            <span className="dot" style={catVar(selectedColor)} aria-hidden />
            <select
              value={currentCategory}
              onChange={(e) => {
                set('category', e.target.value);
                setCategoryTouched(true);
                setRemembered(null);
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>＋ New category…</option>
            </select>
          </div>
        </Field>
        <Field label="Date" error={errors.date} highlight={scanned.has('date')}>
          <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
      </div>

      {draft.category === NEW_CATEGORY && (
        <Field label="New category name" error={errors.newCategory}>
          <input
            type="text"
            value={draft.newCategory}
            onChange={(e) => set('newCategory', e.target.value)}
            placeholder="e.g. Training"
            autoFocus
          />
        </Field>
      )}
      {draft.category === NEW_CATEGORY && <CategoryColorPicker value={newColor} onChange={(c) => set('newColor', c)} />}

      <Field label="Receipt image (optional)">
        <ImageInput value={draft.image} onChange={(v) => set('image', v)} onError={onError} />
      </Field>
      {draft.image && canScan && (
        <button type="button" className="btn btn-secondary scan-btn" onClick={scan} disabled={scanning} aria-busy={scanning}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
          </svg>
          {scanning ? 'Reading receipt…' : 'Read receipt'}
        </button>
      )}

      {duplicateOf && (
        <div className="dup-warning" role="alert">
          <p>
            This looks like a receipt you’ve already added: <strong>{duplicateOf.name}</strong>,{' '}
            {formatMoney(duplicateOf.total)} on {formatDate(duplicateOf.date)}.
          </p>
          <div className="dup-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDuplicateOf(null)}>
              Don’t save
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              onClick={() => (allowDuplicate.current = true)}
              disabled={saving}
            >
              Save anyway
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancelEdit}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : (
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Add receipt'}
        </button>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  action,
  highlight,
  children,
}: {
  label: string;
  error?: string;
  action?: React.ReactNode;
  /** Briefly marks a field that was just filled in by scanning. */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field${error ? ' has-error' : ''}${highlight ? ' scanned' : ''}`}>
      <span className="field-label">
        {label}
        {action}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
