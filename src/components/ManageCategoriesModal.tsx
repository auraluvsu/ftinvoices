import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '../types';
import { useAppData } from '../appData';
import { catVar, SUGGESTED_COLORS } from '../lib/color';
import { Modal } from './Modal';
import { CategoryColorPicker } from './CategoryColorPicker';

/** Rename, recolour, merge, delete and add categories for the open client. */
export function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  const { client, categoryList, receipts, addCategory } = useAppData();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of receipts) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    return m;
  }, [receipts]);
  const sorted = useMemo(
    () => [...categoryList].sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : a.name.localeCompare(b.name))),
    [categoryList],
  );

  const [newName, setNewName] = useState('');
  const usedColors = new Set(categoryList.map((c) => c.color));
  const [newColor, setNewColor] = useState(() => SUGGESTED_COLORS.find((c) => !usedColors.has(c)) ?? SUGGESTED_COLORS[0]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const nameTaken = (name: string, exceptId?: string) =>
    categoryList.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.trim().toLowerCase());

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return setAddError('Enter a name');
    if (nameTaken(name)) return setAddError('That category already exists');
    setAdding(true);
    if (await addCategory(name, newColor)) {
      setNewName('');
      setAddError(null);
    }
    setAdding(false);
  };

  return (
    <Modal label="Manage categories" onClose={onClose} className="modal-form modal-wide">
      <div className="card form">
        <div className="card-head">
          <div>
            <h2>Categories</h2>
            <span className="muted">{client.name}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <ul className="cat-manage">
          {sorted.map((c) => (
            <CategoryRow key={c.id} category={c} count={counts.get(c.id) ?? 0} others={sorted.filter((o) => o.id !== c.id)} nameTaken={nameTaken} />
          ))}
        </ul>

        <form className="cat-add" onSubmit={add} noValidate>
          <h3>Add a category</h3>
          <label className={`field${addError ? ' has-error' : ''}`}>
            <span className="field-label">Name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(null);
              }}
              placeholder="e.g. Training"
            />
            {addError && <span className="field-error">{addError}</span>}
          </label>
          <CategoryColorPicker value={newColor} onChange={setNewColor} />
          <button type="submit" className="btn btn-primary" disabled={adding}>
            {adding ? 'Adding…' : 'Add category'}
          </button>
        </form>
      </div>
    </Modal>
  );
}

function CategoryRow({
  category,
  count,
  others,
  nameTaken,
}: {
  category: Category;
  count: number;
  others: Category[];
  nameTaken: (name: string, exceptId?: string) => boolean;
}) {
  const { updateCategory, mergeCategory, deleteCategory } = useAppData();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'colour' | 'merge' | null>(null);
  const [mergeInto, setMergeInto] = useState(others.find((o) => o.name === 'Other')?.id ?? others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  // Colour previews instantly; the save is debounced so dragging the wheel doesn't spam the database.
  const [color, setColor] = useState(category.color);
  const colorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(colorTimer.current), []);
  const changeColor = (c: string) => {
    setColor(c);
    clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => updateCategory(category.id, { color: c }), 400);
  };

  const commitName = async () => {
    const next = name.trim();
    if (next === category.name) return setError(null);
    if (!next) {
      setName(category.name);
      return setError(null);
    }
    if (nameTaken(next, category.id)) return setError('Already exists');
    setError(null);
    if (!(await updateCategory(category.id, { name: next }))) setName(category.name);
  };

  const target = others.find((o) => o.id === mergeInto);

  return (
    <li className="cat-row">
      <div className="cat-row-main">
        <button
          type="button"
          className="swatch"
          style={catVar(color)}
          aria-label={`Change colour of ${category.name}`}
          aria-expanded={panel === 'colour'}
          onClick={() => setPanel((p) => (p === 'colour' ? null : 'colour'))}
        />
        <div className={`cat-row-name${error ? ' has-error' : ''}`}>
          <input
            type="text"
            value={name}
            aria-label={`Name of ${category.name}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape' && (name !== category.name || error)) {
                e.preventDefault();
                setName(category.name);
                setError(null);
              }
            }}
          />
          {error && <span className="field-error">{error}</span>}
        </div>
        <span className="muted cat-row-count">
          {count} receipt{count === 1 ? '' : 's'}
        </span>
        <div className="cat-row-actions">
          {others.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={panel === 'merge'} onClick={() => setPanel((p) => (p === 'merge' ? null : 'merge'))}>
              Merge…
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon danger"
            disabled={count > 0 || busy}
            title={count > 0 ? 'Still used by receipts — merge it into another category instead' : 'Delete category'}
            aria-label={`Delete ${category.name}`}
            onClick={async () => {
              setBusy(true);
              await deleteCategory(category.id);
              setBusy(false);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </div>
      </div>

      {panel === 'colour' && (
        <div className="cat-row-panel">
          <CategoryColorPicker value={color} onChange={changeColor} />
        </div>
      )}
      {panel === 'merge' && (
        <div className="cat-row-panel cat-merge">
          <label className="inline-label" htmlFor={`merge-${category.id}`}>
            Move {count} receipt{count === 1 ? '' : 's'} into
          </label>
          <select id={`merge-${category.id}`} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!target || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await mergeCategory(category.id, mergeInto);
              if (!ok) setBusy(false);
            }}
          >
            Merge and delete “{category.name}”
          </button>
        </div>
      )}
    </li>
  );
}
