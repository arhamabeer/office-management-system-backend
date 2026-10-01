import { describe, it, expect } from 'vitest';
import { computeSalaryView, fiscalYearBounds } from '../src/modules/payroll/payroll.util';

describe('salary view (annual → monthly; no tax calculation)', () => {
  it('derives monthly salary/tax/net from the annual figures', () => {
    const v = computeSalaryView(9_600_000, 2_541_000);
    expect(v.monthlySalary).toBe(800_000);
    expect(v.monthlyTax).toBe(211_750);
    expect(v.monthlyNet).toBe(800_000 - 211_750);
    expect(v.annualNet).toBe(9_600_000 - 2_541_000);
  });

  it('rounds monthly figures', () => {
    const v = computeSalaryView(1_000_000, 100_000);
    expect(v.monthlySalary).toBe(Math.round(1_000_000 / 12));
    expect(v.monthlyTax).toBe(Math.round(100_000 / 12));
  });

  it('handles zero tax', () => {
    const v = computeSalaryView(1_200_000, 0);
    expect(v.monthlyTax).toBe(0);
    expect(v.monthlyNet).toBe(v.monthlySalary);
    expect(v.annualNet).toBe(1_200_000);
  });
});

describe('fiscalYearBounds (July start)', () => {
  it('maps months to the July–June window, labelled by end year', () => {
    expect(fiscalYearBounds('2026-09', 7)).toEqual({ start: '2026-07', end: '2027-06', label: '2027' });
    expect(fiscalYearBounds('2026-03', 7)).toEqual({ start: '2025-07', end: '2026-06', label: '2026' });
  });
});
