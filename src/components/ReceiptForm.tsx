import { useState } from 'react';
import type { NewCategory, Receipt } from '../types';
import { useAppData } from '../appData';
import { newId, round2, todayIso } from '../lib/format';
import { catVar, SUGGESTED_COLORS } from '../lib/color';
import { ImageInput } from './ImageInput';
import { CategoryColorPicker } from './CategoryColorPicker';

const NEW_CATEGORY = '__new__';
const UK_VAT_RATE = 0.2;

interface Props {
  categories: string[];
  editing: Receipt | null;
  onSave: (receipt: Receipt, newCategory?: NewCategory) => boolean;
  onCancelEdit?: () => void;
  onError: (msg: string) => void;
}

interface Draft {
  name: string;
  total: string;
  vat: string;
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
  const { categoryColor } = useAppData();
  // Default a new category to the first suggested colour not already in use.
  const usedColors = new Set(categories.map(categoryColor));
  const newColor = draft.newColor || (SUGGESTED_COLORS.find((c) => !usedColors.has(c)) ?? SUGGESTED_COLORS[0]);
  const selectedColor = draft.category === NEW_CATEGORY ? newColor : categoryColor(draft.category);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const calcVat = () => {
    const t = Number(draft.total);
    if (!draft.total || isNaN(t)) {
      setErrors((e) => ({ ...e, total: 'Enter a total first' }));
      return;
    }
    // VAT portion of a VAT-inclusive total at 20% = total × 20/120
    set('vat', round2((t * UK_VAT_RATE) / (1 + UK_VAT_RATE)).toFixed(2));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const total = Number(draft.total);
    const vat = draft.vat.trim() === '' ? 0 : Number(draft.vat);
    const isNew = draft.category === NEW_CATEGORY;
    const category = (isNew ? draft.newCategory : draft.category).trim();

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

    const receipt: Receipt = {
      id: editing?.id ?? newId(),
      createdAt: editing?.createdAt ?? Date.now(),
      name: draft.name.trim(),
      total: round2(total),
      vat: round2(vat),
      category: finalCategory,
      date: draft.date,
      image: draft.image,
    };

    if (onSave(receipt, isNew && !existing ? { name: finalCategory, color: newColor } : undefined)) {
      // Keep the category and date — handy when entering a batch of receipts.
      setDraft((d) => ({ ...blank(finalCategory), date: d.date }));
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

      <Field label="Name" error={errors.name}>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Tesco, Train to Leeds"
          autoComplete="off"
        />
      </Field>

      <div className="row-2">
        <Field label="Total (inc. VAT)" error={errors.total}>
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
          action={
            <button type="button" className="link-btn" onClick={calcVat} title="Calculate 20% VAT from the total">
              Calc 20%
            </button>
          }
        >
          <div className="money-input">
            <span>£</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={draft.vat}
              onChange={(e) => set('vat', e.target.value)}
              placeholder="0.00"
            />
          </div>
        </Field>
      </div>

      <div className="row-2">
        <Field label="Category" error={errors.category}>
          <div className="select-swatch">
            <span className="dot" style={catVar(selectedColor)} aria-hidden />
            <select value={draft.category} onChange={(e) => set('category', e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>＋ New category…</option>
            </select>
          </div>
        </Field>
        <Field label="Date" error={errors.date}>
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

      {editing ? (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancelEdit}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save changes
          </button>
        </div>
      ) : (
        <button type="submit" className="btn btn-primary btn-block">
          Add receipt
        </button>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  action,
  children,
}: {
  label: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">
        {label}
        {action}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
