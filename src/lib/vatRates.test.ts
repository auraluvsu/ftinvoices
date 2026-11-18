import { describe, expect, it } from 'vitest';
import { hasNoVat, isVatRate, vatFromGross, vatRateInfo } from './vatRates';

describe('vatFromGross', () => {
  it('takes 1/6 of the total at the standard rate', () => {
    expect(vatFromGross(60, 'standard')).toBe(10);
    expect(vatFromGross(24.99, 'standard')).toBe(4.17);
  });
  it('takes 1/21 of the total at the reduced rate', () => {
    expect(vatFromGross(21, 'reduced')).toBe(1);
    expect(vatFromGross(100, 'reduced')).toBe(4.76);
  });
  it('is 0 for zero-rated, exempt and not-registered suppliers', () => {
    for (const r of ['zero', 'exempt', 'outside'] as const) {
      expect(vatFromGross(100, r)).toBe(0);
      expect(hasNoVat(r)).toBe(true);
    }
    expect(hasNoVat('standard')).toBe(false);
  });
});

describe('isVatRate', () => {
  it('accepts only known rates', () => {
    expect(isVatRate('reduced')).toBe(true);
    expect(isVatRate('20%')).toBe(false);
    expect(isVatRate(undefined)).toBe(false);
  });
  it('falls back to standard for display of an unknown value', () => {
    expect(vatRateInfo('bogus' as never).id).toBe('standard');
  });
});
