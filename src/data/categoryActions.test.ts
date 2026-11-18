import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../types';
import type { StoredReceipt } from '../lib/db';
import { testState } from './testState';

const db = vi.hoisted(() => ({
  insertCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reassignReceipts: vi.fn(),
}));
vi.mock('../lib/db', () => db);

const { categoryActions } = await import('./categoryActions');

const fuel: Category = { id: 'c1', clientId: 'k', name: 'Fuel', color: '#ff0000' };
const travel: Category = { id: 'c2', clientId: 'k', name: 'Travel', color: '#00ff00' };
const receipt = { id: 'r1', clientId: 'k', categoryId: 'c1', name: 'Shell', total: 60, vat: 10, vatRate: 'standard', date: '2026-11-02', createdAt: 1 } as StoredReceipt;

function setup() {
  const cats = testState<Category[]>([fuel, travel]);
  const recs = testState<StoredReceipt[]>([receipt]);
  const notify = vi.fn();
  const actions = categoryActions({
    clientId: 'k',
    categoryList: cats.get(),
    setCategoryList: cats.set,
    setStored: recs.set,
    setRecurring: () => {},
    notify,
  });
  return { cats, recs, notify, actions };
}

describe('categoryActions', () => {
  beforeEach(() => Object.values(db).forEach((f) => f.mockReset()));

  it('adds the created category', async () => {
    const { cats, actions } = setup();
    db.insertCategory.mockResolvedValue({ id: 'c3', clientId: 'k', name: 'Food', color: '#0000ff' });
    await expect(actions.addCategory('Food', '#0000ff')).resolves.toBe(true);
    expect(db.insertCategory).toHaveBeenCalledWith('k', 'Food', '#0000ff');
    expect(cats.get().map((c) => c.name)).toEqual(['Fuel', 'Travel', 'Food']);
  });

  it('puts the old name back if an update fails', async () => {
    const { cats, notify, actions } = setup();
    db.updateCategory.mockRejectedValue(new Error('duplicate key'));
    await expect(actions.updateCategory('c1', { name: 'Petrol' })).resolves.toBe(false);
    expect(cats.get()[0].name).toBe('Fuel');
    expect(notify).toHaveBeenCalledWith('Couldn’t update category: duplicate key', 'error');
  });

  it('merges by moving receipts, then deleting the old category', async () => {
    const { cats, recs, actions } = setup();
    db.reassignReceipts.mockResolvedValue(undefined);
    db.deleteCategory.mockResolvedValue(undefined);
    await expect(actions.mergeCategory('c1', 'c2')).resolves.toBe(true);
    expect(db.reassignReceipts).toHaveBeenCalledWith('k', 'c1', 'c2');
    expect(recs.get()[0].categoryId).toBe('c2');
    expect(cats.get().map((c) => c.id)).toEqual(['c2']);
  });

  it('keeps a category that couldn’t be deleted', async () => {
    const { cats, notify, actions } = setup();
    db.deleteCategory.mockRejectedValue(new Error('in use'));
    await expect(actions.deleteCategory('c1')).resolves.toBe(false);
    expect(cats.get()).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith('Couldn’t delete category: in use', 'error');
  });
});
