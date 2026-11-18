import { describe, expect, it } from 'vitest';
import type { Income, Receipt } from '../types';
import { vatReturnBoxes } from './vatReturn';

const r = (total: number, vat: number) => ({ total, vat }) as Receipt;
const sale = (net: number, vat: number, vatRate: Income['vatRate'] = 'standard') => ({ net, vat, vatRate }) as Income;

describe('vatReturnBoxes', () => {
  it('works out the purchase boxes from receipts', () => {
    const b = vatReturnBoxes([r(120.1, 20.02), r(0.2, 0.03), r(1000.99, 166.83)]);
    expect(b.box4).toBe(186.88);
    expect(b.box7).toBe(934);
  });
  it('works out the sales boxes and the net VAT to pay', () => {
    const b = vatReturnBoxes([r(60, 10)], [sale(1000.6, 200.12), sale(50, 0, 'zero'), sale(300, 0, 'outside')]);
    expect(b.box1).toBe(200.12);
    expect(b.box3).toBe(200.12);
    expect(b.box5).toBe(190.12);
    expect(b.box6).toBe(1050); // outside-the-scope sales left out; pence dropped
  });
  it('gives a negative Box 5 when more VAT was paid than charged', () => {
    expect(vatReturnBoxes([r(120, 20)], [sale(10, 2)]).box5).toBe(-18);
  });
  it('is all zeros with nothing in the quarter', () => {
    expect(vatReturnBoxes([], [])).toEqual({ box1: 0, box3: 0, box4: 0, box5: 0, box6: 0, box7: 0 });
  });
});
