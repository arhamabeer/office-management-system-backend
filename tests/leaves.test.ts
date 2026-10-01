import { describe, it, expect } from 'vitest';
import {
  eachDay,
  workingDays,
  computeRemaining,
  carryForwardDays,
  isWithinProbation,
  leaveYearOf,
} from '../src/modules/leaves/leaves.util';

describe('leaves util', () => {
  it('eachDay lists inclusive day range', () => {
    expect(eachDay('2026-01-01', '2026-01-03')).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(eachDay('2026-01-05', '2026-01-05')).toEqual(['2026-01-05']);
  });

  it('workingDays excludes weekends and holidays', () => {
    // 2026-01-05 Mon ... 2026-01-11 Sun; weekOff Sat/Sun; holiday on Wed 07
    const days = workingDays('2026-01-05', '2026-01-11', [0, 6], new Set(['2026-01-07']));
    expect(days).toEqual(['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09']);
  });

  it('computeRemaining = entitled + carried - used', () => {
    expect(computeRemaining(20, 5, 8)).toBe(17);
    expect(computeRemaining(20, 0, 20)).toBe(0);
  });

  it('carryForwardDays caps at the limit and floors at zero', () => {
    expect(carryForwardDays(14, 10)).toBe(10);
    expect(carryForwardDays(6, 10)).toBe(6);
    expect(carryForwardDays(-3, 10)).toBe(0);
  });

  it('isWithinProbation respects the joining date + window', () => {
    const joined = new Date('2026-01-01T00:00:00Z');
    expect(isWithinProbation(joined, '2026-02-15', 3)).toBe(true); // within 3 months
    expect(isWithinProbation(joined, '2026-05-01', 3)).toBe(false); // after
    expect(isWithinProbation(joined, '2026-02-15', 0)).toBe(false); // no probation
    expect(isWithinProbation(undefined, '2026-02-15', 3)).toBe(false);
  });

  it('leaveYearOf extracts the year', () => {
    expect(leaveYearOf('2026-09-15')).toBe(2026);
  });
});
