import type { WeekSummaryDTO, AttendancePeriod } from '@ems/types';
import { addDays, weekStartOf } from './attendance.util';

/** How many Mon–Sun weeks each period covers (current week + prior weeks). */
export const WEEKS_BACK: Record<AttendancePeriod, number> = {
  '1w': 1,
  '2w': 2,
  '1m': 4,
  '3m': 13,
  '6m': 26,
  '1y': 52,
};

interface DayRec {
  date: string;
  status?: string | null;
  workedMinutes?: number | null;
}

/** The `n` most-recent Monday week-starts ending with the week of `today`,
 *  oldest first. */
export function recentWeekStarts(today: string, n: number): string[] {
  const current = weekStartOf(today);
  return Array.from({ length: n }, (_, i) => addDays(current, -(n - 1 - i) * 7));
}

/** Aggregate one person's day records into per-week summaries for the given
 *  Monday week-starts. `today` bounds "complete" and stops future days. */
export function summariseWeeks(
  records: DayRec[],
  weekStarts: string[],
  weeklyMinimumMinutes: number,
  today: string,
): WeekSummaryDTO[] {
  const byDate = new Map<string, DayRec>();
  for (const r of records) byDate.set(r.date, r);

  return weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const s: WeekSummaryDTO = {
      weekStart,
      weekEnd,
      workedMinutes: 0,
      present: 0,
      halfDay: 0,
      absent: 0,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
      complete: weekEnd < today,
      short: false,
    };
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      if (day > today) break; // don't count future days
      const rec = byDate.get(day);
      if (!rec) continue;
      s.workedMinutes += rec.workedMinutes ?? 0;
      switch (rec.status) {
        case 'HalfDay':
          s.halfDay++;
          break;
        case 'Absent':
          s.absent++;
          break;
        case 'OnLeave':
          s.onLeave++;
          break;
        case 'Holiday':
          s.holiday++;
          break;
        case 'WeekOff':
          s.weekOff++;
          break;
        default:
          s.present++; // Present or unknown
          break;
      }
    }
    // A completed week counts as "short" only if some work was expected —
    // i.e. it isn't a full week of leave/holiday/week-off.
    const workedOrExpected = s.present + s.halfDay + s.absent > 0;
    s.short = s.complete && workedOrExpected && s.workedMinutes < weeklyMinimumMinutes;
    return s;
  });
}
