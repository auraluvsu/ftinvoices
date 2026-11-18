import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../types';
import type { StoredReceipt } from '../lib/db';
import { testState } from './testState';

const db = vi.hoisted(() => {
  class ReceiptConflictError extends Error {}
  return {
    ReceiptConflictError,
    insertCategory: vi.fn(),
    imagePathFor: (u: string, c: string, r: string) => `${u}/${c}/${r}.jpg`,
    uploadImage: vi.fn(),
    removeImages: vi.fn(() => Promise.resolve()),
    upsertReceipt: vi.fn(),
    updateReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
    deleteReceipts: vi.fn(),
    restoreReceipts: vi.fn(),
    setReceiptsCategory: vi.fn(),
  };
});
vi.mock('../lib/db', () => db);
vi.mock('../lib/image', () => ({ dataUrlToBlob: async () => new Blob(['x']) }));

const { receiptActions } = await import('./receiptActions');

const fuel: Category = { id: 'c1', clientId: 'k', name: 'Fuel', color: '#ff0000' };
const shell: StoredReceipt = {
  id: 'r1', clientId: 'k', categoryId: 'c1', name: 'Shell', total: 60, vat: 10, date: '2026-11-02',
  imagePath: 'u/k/r1-1.jpg', createdAt: 1, updatedAt: '2026-11-02T10:00:00Z',
};
const bp: StoredReceipt = { ...shell, id: 'r2', name: 'BP', imagePath: 'u/k/r2-1.jpg' };
const draft = { id: 'r1', name: 'Shell', total: 60, vat: 10, category: 'Fuel', date: '2026-11-02', image: 'https://signed' };

function setup() {
  const cats = testState<Category[]>([fuel]);
  const recs = testState<StoredReceipt[]>([shell, bp]);
  const deps = {
    userId: 'u',
    clientId: 'k',
    categoryList: cats.get(),
    setCategoryList: cats.set,
    stored: recs.get(),
    setStored: recs.set,
    reloadSilently: vi.fn(),
    notify: vi.fn(),
    dismissToast: vi.fn(),
    showLocal: vi.fn(),
    scheduleImageDelete: vi.fn(),
    cancelImageDelete: vi.fn(),
  };
  return { cats, recs, deps, actions: receiptActions(deps) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('receiptActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('edits with the last-seen updated_at so newer changes aren’t overwritten', async () => {
    const { recs, actions } = setup();
    db.updateReceipt.mockImplementation(async (r) => ({ ...r, updatedAt: 'later' }));
    await expect(actions.saveReceipt({ ...draft, total: 70 })).resolves.toBe(true);
    expect(db.updateReceipt).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', total: 70, imagePath: shell.imagePath }), shell.updatedAt);
    expect(recs.get()[0]).toMatchObject({ total: 70, updatedAt: 'later' });
  });

  it('reloads and keeps the form open on an edit conflict', async () => {
    const { deps, actions } = setup();
    db.updateReceipt.mockRejectedValue(new db.ReceiptConflictError('Changed on another device'));
    await expect(actions.saveReceipt(draft)).resolves.toBe(false);
    expect(deps.reloadSilently).toHaveBeenCalled();
  });

  it('uploads a new photo and removes the replaced one', async () => {
    const { deps, actions } = setup();
    db.updateReceipt.mockImplementation(async (r) => r);
    await actions.saveReceipt({ ...draft, image: 'data:image/jpeg;base64,AAAA' });
    const path = db.uploadImage.mock.calls[0][0];
    expect(path).toMatch(/^u\/k\/r1/);
    expect(deps.showLocal).toHaveBeenCalledWith(path, 'data:image/jpeg;base64,AAAA');
    expect(db.removeImages).toHaveBeenCalledWith([shell.imagePath]);
  });

  it('removes a just-uploaded photo if the row can’t be saved', async () => {
    const { actions } = setup();
    db.updateReceipt.mockRejectedValue(new Error('offline'));
    await actions.saveReceipt({ ...draft, image: 'data:image/jpeg;base64,AAAA' });
    expect(db.removeImages).toHaveBeenCalledWith([db.uploadImage.mock.calls[0][0]]);
  });

  it('bulk delete holds the photos until Undo has passed, and Undo keeps them', async () => {
    const { recs, deps, actions } = setup();
    db.deleteReceipts.mockResolvedValue(undefined);
    db.restoreReceipts.mockImplementation(async (rows) => rows);
    actions.deleteReceipts([shell, bp] as never);
    expect(recs.get()).toHaveLength(0);
    await flush();
    expect(deps.scheduleImageDelete.mock.calls.map((c) => c[0])).toEqual([shell.imagePath, bp.imagePath]);
    const undo = deps.notify.mock.calls[0][2];
    await undo();
    expect(deps.cancelImageDelete.mock.calls.map((c) => c[0])).toEqual([shell.imagePath, bp.imagePath]);
    expect(recs.get()).toHaveLength(2);
  });

  it('puts receipts back if a bulk delete fails', async () => {
    const { recs, actions } = setup();
    db.deleteReceipts.mockRejectedValue(new Error('offline'));
    actions.deleteReceipts([shell] as never);
    await flush();
    expect(recs.get().map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});
