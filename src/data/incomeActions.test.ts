import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Income } from '../types';
import { testState } from './testState';

const db = vi.hoisted(() => ({ upsertIncome: vi.fn(), deleteIncome: vi.fn() }));
vi.mock('../lib/db', () => db);

const { incomeActions } = await import('./incomeActions');

const sale: Income = { id: 'i1', clientId: 'k', customer: 'Big Co', net: 1000, vat: 200, vatRate: 'standard', date: '2026-10-05', createdAt: 1 };
const filedQ3 = { id: 'f', clientId: 'k', start: '2026-07-01', end: '2026-09-30', filedAt: '2026-10-20T09:00:00Z', box4: 0, box7: 0, box1: 0, box6: 0 };

function setup() {
  const inc = testState<Income[]>([sale]);
  const deps = {
    income: inc.get(),
    setIncome: inc.set,
    notify: vi.fn(),
    dismissToast: vi.fn(),
    lockedBy: (d: string) => (d >= filedQ3.start && d <= filedQ3.end ? filedQ3 : undefined),
  };
  return { inc, deps, actions: incomeActions(deps) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('incomeActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds new income at the top and updates existing income in place', async () => {
    const { inc, actions } = setup();
    db.upsertIncome.mockImplementation(async (i) => i);
    await actions.saveIncome({ ...sale, id: 'i2', customer: 'Small Co' });
    await actions.saveIncome({ ...sale, net: 900 });
    expect(inc.get().map((i) => [i.id, i.net])).toEqual([['i2', 1000], ['i1', 900]]);
  });

  it('refuses to move income into a filed quarter', async () => {
    const { deps, actions } = setup();
    await expect(actions.saveIncome({ ...sale, date: '2026-08-01' })).resolves.toBe(false);
    expect(db.upsertIncome).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(expect.stringMatching(/filed on 20 Oct 2026/), 'error');
  });

  it('deletes with Undo', async () => {
    const { inc, deps, actions } = setup();
    db.deleteIncome.mockResolvedValue(undefined);
    db.upsertIncome.mockImplementation(async (i) => i);
    actions.deleteIncome(sale);
    expect(inc.get()).toHaveLength(0);
    await flush();
    await deps.notify.mock.calls[0][2]();
    expect(db.upsertIncome).toHaveBeenCalledWith(sale);
    expect(inc.get()).toHaveLength(1);
  });
});
