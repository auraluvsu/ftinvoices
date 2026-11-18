import { describe, expect, it } from 'vitest';
import { filedQuarterFor } from './filedQuarters';
import { quarterPeriod, quarterStart } from './quarters';
import type { FiledQuarter } from '../types';

const q3: FiledQuarter = { id: 'f', clientId: 'c', start: '2026-07-01', end: '2026-09-30', filedAt: '', box4: 0, box7: 0, box1: null, box6: null };

describe('filedQuarterFor', () => {
  it('matches dates inside the period, including both ends', () => {
    expect(filedQuarterFor('2026-07-01', [q3])).toBe(q3);
    expect(filedQuarterFor('2026-09-30', [q3])).toBe(q3);
    expect(filedQuarterFor('2026-06-30', [q3])).toBeUndefined();
    expect(filedQuarterFor('2026-10-01', [q3])).toBeUndefined();
  });
});

describe('quarterPeriod', () => {
  it('gives the first and last day of calendar quarters', () => {
    expect(quarterPeriod(quarterStart('2026-08-15', 0))).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterPeriod(quarterStart('2026-02-15', 0))).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });
  it('handles staggered quarters across a year end and leap years', () => {
    expect(quarterPeriod(quarterStart('2026-12-10', 1))).toEqual({ from: '2026-11-01', to: '2027-01-31' });
    expect(quarterPeriod(quarterStart('2028-01-10', 2))).toEqual({ from: '2027-12-01', to: '2028-02-29' });
  });
});
