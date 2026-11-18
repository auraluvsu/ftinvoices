import { describe, expect, it } from 'vitest';
import { mergeScan, type MergeOptions, type ScanFields } from './scan';
import type { ScanResult } from './db';

const TODAY = '2026-11-18';
const empty: ScanFields = { name: '', total: '', vat: '', date: TODAY, category: 'Other' };
const scan: ScanResult = { name: 'Shell', total: 60, vat: 10, date: '2026-11-02', category: 'Fuel' };
const opts = (o: Partial<MergeOptions> = {}): MergeOptions => ({
  today: TODAY,
  categories: ['Fuel', 'Travel', 'Other'],
  keepCategory: false,
  rememberedCategory: () => undefined,
  ...o,
});

describe('mergeScan', () => {
  it('fills every empty field, formatting amounts to 2dp', () => {
    expect(mergeScan(empty, scan, opts()).patch).toEqual({
      name: 'Shell',
      total: '60.00',
      vat: '10.00',
      date: '2026-11-02',
      category: 'Fuel',
    });
  });

  it('never overwrites fields you have already filled', () => {
    const typed: ScanFields = { name: 'BP', total: '55.00', vat: '9.17', date: '2026-11-01', category: 'Other' };
    expect(mergeScan(typed, scan, opts({ keepCategory: true })).patch).toEqual({});
  });

  it('treats whitespace-only fields as empty', () => {
    expect(mergeScan({ ...empty, name: '  ', total: ' ' }, scan, opts()).patch).toMatchObject({ name: 'Shell', total: '60.00' });
  });

  it('replaces a date still set to today, but not another date', () => {
    expect(mergeScan(empty, scan, opts()).patch.date).toBe('2026-11-02');
    expect(mergeScan({ ...empty, date: '2026-10-30' }, scan, opts()).patch.date).toBeUndefined();
  });

  it('skips fields the scan could not read', () => {
    const blank: ScanResult = { name: null, total: null, vat: null, date: null, category: null };
    expect(mergeScan(empty, blank, opts()).patch).toEqual({});
  });

  it('keeps a hand-picked category', () => {
    expect(mergeScan(empty, scan, opts({ keepCategory: true })).patch.category).toBeUndefined();
  });

  it('prefers the category you last used for this supplier over the model’s guess', () => {
    const r = mergeScan(empty, scan, opts({ rememberedCategory: (k) => (k === 'shell' ? 'Travel' : undefined) }));
    expect(r.patch.category).toBe('Travel');
    expect(r.remembered).toBe('Travel');
  });

  it('looks up supplier memory by the name already typed when the scan has none', () => {
    const r = mergeScan({ ...empty, name: ' Shell ' }, { ...scan, name: null }, opts({ rememberedCategory: (k) => (k === 'shell' ? 'Travel' : undefined) }));
    expect(r.patch.category).toBe('Travel');
  });

  it('ignores a remembered category that no longer exists', () => {
    const r = mergeScan(empty, scan, opts({ rememberedCategory: () => 'Deleted category' }));
    expect(r.patch.category).toBe('Fuel');
    expect(r.remembered).toBeNull();
  });

  it('does not patch the category when it already matches', () => {
    expect(mergeScan({ ...empty, category: 'Fuel' }, scan, opts()).patch.category).toBeUndefined();
  });
});
