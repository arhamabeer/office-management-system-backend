import { weekdayOf } from '../attendance/attendance.util';

/** Inclusive list of YYYY-MM-DD day keys from start to end. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  let cur = Date.UTC(ys, ms - 1, ds);
  const last = Date.UTC(ye, me - 1, de);
  while (cur <= last) {
    const d = new Date(cur);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    );
    cur += 86400000;
  }
  return out;
}

/** Working days in a range, excluding week-off days and holidays. */
export function workingDays(
  start: string,
  end: string,
  weekOff: number[],
  holidays: Set<string>,
): string[] {
  return eachDay(start, end).filter(
    (d) => !weekOff.includes(weekdayOf(d)) && !holidays.has(d),
  );
}

/** Remaining balance = entitled + carried − used. */
export function computeRemaining(entitled: number, carried: number, used: number): number {
  return entitled + carried - used;
}

/** Carry-forward = min(previous unused, cap). */
export function carryForwardDays(previousUnused: number, cap: number): number {
  return Math.max(0, Math.min(previousUnused, cap));
}

/** Whether a date falls within the probation window from a joining date. */
export function isWithinProbation(
  joiningDate: Date | undefined | null,
  onDate: string,
  probationMonths: number,
): boolean {
  if (!joiningDate || probationMonths <= 0) return false;
  const end = new Date(joiningDate);
  end.setMonth(end.getMonth() + probationMonths);
  const [y, m, d] = onDate.split('-').map(Number);
  const on = new Date(Date.UTC(y, m - 1, d));
  return on.getTime() < end.getTime();
}

export function leaveYearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}
