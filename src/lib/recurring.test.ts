import { describe, expect, it } from 'vitest';
import { addPeriod, dueDates, nextAfter } from './recurring';

describe('addPeriod', () => {
  it('adds months, quarters and years', () => {
    expect(addPeriod('2026-11-05', 'monthly', 5)).toBe('2026-12-05');
    expect(addPeriod('2026-12-05', 'monthly', 5)).toBe('2027-01-05');
    expect(addPeriod('2026-11-05', 'quarterly', 5)).toBe('2027-02-05');
    expect(addPeriod('2026-11-05', 'yearly', 5)).toBe('2027-11-05');
  });
  it('uses the last day of short months, then returns to the anchor day', () => {
    expect(addPeriod('2027-01-31', 'monthly', 31)).toBe('2027-02-28');
    expect(addPeriod('2027-02-28', 'monthly', 31)).toBe('2027-03-31');
    expect(addPeriod('2028-01-31', 'monthly', 31)).toBe('2028-02-29');
    expect(addPeriod('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
  });
});

describe('dueDates', () => {
  const netflix = { nextDate: '2026-09-15', frequency: 'monthly' as const, anchorDay: 15 };
  it('lists every missed date up to today', () => {
    expect(dueDates(netflix, '2026-11-18')).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    expect(dueDates(netflix, '2026-11-15')).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    expect(dueDates(netflix, '2026-09-14')).toEqual([]);
  });
  it('caps a long gap', () => {
    expect(dueDates({ ...netflix, nextDate: '2020-01-15' }, '2026-11-18', 12)).toHaveLength(12);
  });
  it('works out the next date after the ones handled', () => {
    expect(nextAfter(netflix, ['2026-09-15', '2026-10-15'])).toBe('2026-11-15');
    expect(nextAfter(netflix, [])).toBe('2026-09-15');
  });
});
