import { describe, it, expect } from 'vitest';
import { addDays, weekStartOf, weekEndOf, eachDay } from '../src/modules/attendance/attendance.util';
import { summariseWeeks, recentWeekStarts } from '../src/modules/attendance/attendance.report';

describe('week date helpers', () => {
  it('addDays shifts calendar dates across month boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
  });

  it('weekStartOf/weekEndOf span Monday–Sunday', () => {
    // 2026-09-30 is a Wednesday.
    expect(weekStartOf('2026-09-30')).toBe('2026-09-28'); // Monday
    expect(weekEndOf('2026-09-30')).toBe('2026-10-04'); // Sunday
    // A Sunday belongs to the week that started the previous Monday.
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28');
    // A Monday is its own week start.
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28');
  });

  it('eachDay is inclusive and ordered', () => {
    expect(eachDay('2026-09-28', '2026-09-30')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
  });

  it('recentWeekStarts returns N Mondays ending with the current week', () => {
    expect(recentWeekStarts('2026-09-30', 4)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });
});

describe('summariseWeeks', () => {
  const WEEK1 = '2026-09-14'; // Mon; ends Sun 2026-09-20
  const WEEK2 = '2026-09-21'; // Mon; ends Sun 2026-09-27 (current at 2026-09-23)
  const TODAY = '2026-09-23'; // Wednesday of WEEK2

  it('aggregates hours + day counts and flags short only for completed weeks', () => {
    const records = [
      { date: '2026-09-14', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-15', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-16', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-17', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-18', status: 'Present', workedMinutes: 480 }, // week1 = 2400m (40h) < 45h
      { date: '2026-09-21', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-22', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-23', status: 'Present', workedMinutes: 480 }, // week2 = 1440m, in-progress
    ];
    const [w1, w2] = summariseWeeks(records, [WEEK1, WEEK2], 2700, TODAY);

    expect(w1.workedMinutes).toBe(2400);
    expect(w1.present).toBe(5);
    expect(w1.complete).toBe(true);
    expect(w1.short).toBe(true); // completed & under 45h

    expect(w2.workedMinutes).toBe(1440);
    expect(w2.present).toBe(3);
    expect(w2.complete).toBe(false);
    expect(w2.short).toBe(false); // current week never flagged short
  });

  it('does not flag a completed full-leave week as short', () => {
    const records = [
      { date: '2026-09-14', status: 'OnLeave', workedMinutes: 0 },
      { date: '2026-09-15', status: 'OnLeave', workedMinutes: 0 },
      { date: '2026-09-16', status: 'OnLeave', workedMinutes: 0 },
      { date: '2026-09-17', status: 'OnLeave', workedMinutes: 0 },
      { date: '2026-09-18', status: 'OnLeave', workedMinutes: 0 },
    ];
    const [w1] = summariseWeeks(records, [WEEK1], 2700, TODAY);
    expect(w1.onLeave).toBe(5);
    expect(w1.complete).toBe(true);
    expect(w1.short).toBe(false); // no work was expected
  });

  it('flags a completed week with absences and low hours as short', () => {
    const records = [
      { date: '2026-09-14', status: 'Present', workedMinutes: 480 },
      { date: '2026-09-15', status: 'Absent', workedMinutes: 0 },
      { date: '2026-09-16', status: 'Present', workedMinutes: 480 },
    ];
    const [w1] = summariseWeeks(records, [WEEK1], 2700, TODAY);
    expect(w1.absent).toBe(1);
    expect(w1.workedMinutes).toBe(960);
    expect(w1.short).toBe(true);
  });
});
