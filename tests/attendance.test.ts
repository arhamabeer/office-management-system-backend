import { describe, it, expect } from 'vitest';
import {
  daysInMonth,
  weekdayOf,
  minutesBetween,
  deriveStatus,
  overtimeMinutes,
  isWeekOff,
  monthOf,
} from '../src/modules/attendance/attendance.util';

const policy = { workdayMinutes: 480, halfDayMinutes: 240, weekOff: [0, 6] };

describe('attendance util', () => {
  it('daysInMonth handles month lengths and leap years', () => {
    expect(daysInMonth('2026-02')).toHaveLength(28);
    expect(daysInMonth('2024-02')).toHaveLength(29);
    expect(daysInMonth('2026-01')[0]).toBe('2026-01-01');
    expect(daysInMonth('2026-01').at(-1)).toBe('2026-01-31');
  });

  it('weekdayOf is timezone-agnostic', () => {
    expect(weekdayOf('2021-01-04')).toBe(1); // Monday
    expect(weekdayOf('2021-01-03')).toBe(0); // Sunday
  });

  it('minutesBetween is non-negative', () => {
    const a = new Date('2026-01-01T09:00:00Z');
    const b = new Date('2026-01-01T18:00:00Z');
    expect(minutesBetween(a, b)).toBe(540);
    expect(minutesBetween(b, a)).toBe(0);
  });

  it('deriveStatus / overtime respect the policy thresholds', () => {
    expect(deriveStatus(540, policy)).toBe('Present');
    expect(deriveStatus(300, policy)).toBe('HalfDay');
    expect(overtimeMinutes(540, policy)).toBe(60);
    expect(overtimeMinutes(400, policy)).toBe(0);
  });

  it('isWeekOff reads the policy week-off days', () => {
    expect(isWeekOff('2021-01-03', policy)).toBe(true); // Sunday
    expect(isWeekOff('2021-01-04', policy)).toBe(false); // Monday
  });

  it('monthOf extracts YYYY-MM', () => {
    expect(monthOf('2026-09-15')).toBe('2026-09');
  });
});
