import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, RecurringExpense } from '../types';
import type { StoredReceipt } from '../lib/db';
import { testState } from './testState';

const db = vi.hoisted(() => ({
  advanceRecurring: vi.fn(),
  restoreReceipts: vi.fn(),
  deleteRecurring: vi.fn(),
}));
vi.mock('../lib/db', () => db);

const { recurringActions, recurringFromReceipt } = await import('./recurringActions');

const other: Category = { id: 'other', clientId: 'k', name: 'Other', color: '#ff8c00' };
const netflix: RecurringExpense = {
  id: 'n', clientId: 'k', categoryId: 'soft', name: 'Netflix', total: 10.99, vat: 1.83, vatRate: 'standard',
  frequency: 'monthly', anchorDay: 15, nextDate: '2026-10-15',
};

function setup() {
  const recs = testState<StoredReceipt[]>([]);
  const rec = testState<RecurringExpense[]>([netflix]);
  const deps = { clientId: 'k', categoryList: [other], setStored: recs.set, setRecurring: rec.set, reloadSilently: vi.fn(), notify: vi.fn() };
  return { recs, rec, deps, actions: recurringActions(deps) };
}

describe('recurringFromReceipt', () => {
  it('repeats on the same day of the month, starting one period later', () => {
    const r = recurringFromReceipt(
      { clientId: 'k', categoryId: 'c', name: 'Phone', total: 24, vat: 4, vatRate: 'standard', date: '2026-01-31' },
      'monthly',
    );
    expect(r).toMatchObject({ anchorDay: 31, nextDate: '2026-02-28', frequency: 'monthly', name: 'Phone' });
  });
});

describe('applyRecurring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves the expense on first, then adds the receipts that were kept', async () => {
    const { recs, rec, actions } = setup();
    db.advanceRecurring.mockResolvedValue({ ...netflix, nextDate: '2026-12-15' });
    db.restoreReceipts.mockImplementation(async (rows) => rows);
    const ok = await actions.applyRecurring(netflix, [
      { date: '2026-10-15', add: false, total: 10.99, vat: 1.83 },
      { date: '2026-11-15', add: true, total: 10.99, vat: 1.83 },
    ]);
    expect(ok).toBe(true);
    expect(db.advanceRecurring).toHaveBeenCalledWith('n', '2026-10-15', '2026-12-15', undefined);
    expect(db.advanceRecurring.mock.invocationCallOrder[0]).toBeLessThan(db.restoreReceipts.mock.invocationCallOrder[0]);
    expect(recs.get()).toHaveLength(1);
    expect(recs.get()[0]).toMatchObject({ name: 'Netflix', date: '2026-11-15', categoryId: 'soft', vatRate: 'standard' });
    expect(rec.get()[0].nextDate).toBe('2026-12-15');
  });

  it('carries a new price forward', async () => {
    const { actions } = setup();
    db.advanceRecurring.mockResolvedValue({ ...netflix, total: 12.99, vat: 2.17, nextDate: '2026-11-15' });
    db.restoreReceipts.mockImplementation(async (rows) => rows);
    await actions.applyRecurring(netflix, [{ date: '2026-10-15', add: true, total: 12.99, vat: 2.17 }]);
    expect(db.advanceRecurring).toHaveBeenCalledWith('n', '2026-10-15', '2026-11-15', { total: 12.99, vat: 2.17 });
  });

  it('adds nothing if another device got there first', async () => {
    const { deps, actions } = setup();
    db.advanceRecurring.mockResolvedValue(null);
    await expect(actions.applyRecurring(netflix, [{ date: '2026-10-15', add: true, total: 10.99, vat: 1.83 }])).resolves.toBe(false);
    expect(db.restoreReceipts).not.toHaveBeenCalled();
    expect(deps.reloadSilently).toHaveBeenCalled();
  });

  it('puts the expense back if the receipts can’t be saved', async () => {
    const { rec, actions } = setup();
    db.advanceRecurring.mockResolvedValueOnce({ ...netflix, nextDate: '2026-11-15' }).mockResolvedValueOnce(netflix);
    db.restoreReceipts.mockRejectedValue(new Error('offline'));
    await expect(actions.applyRecurring(netflix, [{ date: '2026-10-15', add: true, total: 10.99, vat: 1.83 }])).resolves.toBe(false);
    expect(db.advanceRecurring).toHaveBeenLastCalledWith('n', '2026-11-15', '2026-10-15', undefined);
    expect(rec.get()[0].nextDate).toBe('2026-10-15');
  });

  it('uses Other when the expense’s category was deleted', async () => {
    const { recs, actions } = setup();
    db.advanceRecurring.mockResolvedValue({ ...netflix, nextDate: '2026-11-15' });
    db.restoreReceipts.mockImplementation(async (rows) => rows);
    await actions.applyRecurring({ ...netflix, categoryId: null }, [{ date: '2026-10-15', add: true, total: 10.99, vat: 1.83 }]);
    expect(recs.get()[0].categoryId).toBe('other');
  });
});
