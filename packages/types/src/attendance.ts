import type { AttendanceStatus, AttendanceSource, LeaveRequestStatus } from './enums';

export interface AttendanceDTO {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkInAt?: string;
  checkOutAt?: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  workedMinutes: number;
  overtimeMinutes: number;
  note?: string;
}

export interface AttendanceSummary {
  month: string; // YYYY-MM
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  weekOff: number;
  holiday: number;
  workingDays: number;
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  avgWorkedMinutes: number;
}

export interface MyAttendanceResponse {
  today: AttendanceDTO | null;
  records: AttendanceDTO[];
  summary: AttendanceSummary;
}

export interface AttendancePolicyDTO {
  workdayMinutes: number;
  halfDayMinutes: number;
  shiftStart: string;
  shiftEnd: string;
  weekOff: number[];
  graceMinutes: number;
  /** IANA timezone that defines the office calendar day (e.g. Asia/Karachi). */
  timezone: string;
  /** When on, un-checked-in employees are marked Absent after the cutoff. */
  autoAbsentEnabled: boolean;
  /** Local cut-off time (HH:MM, in `timezone`) after which absence is marked. */
  autoAbsentCutoff: string;
  /** Minimum worked minutes per week; a completed week under this is "Short". */
  weeklyMinimumMinutes: number;
}

/** Roster status for a single day: any stored status, or "NotCheckedIn" for an
 *  employee who is expected today but has not punched in yet. */
export type RosterStatus = AttendanceStatus | 'NotCheckedIn';

/** One employee's standing for a given day — present in the roster even when
 *  they have no attendance record yet. */
export interface AttendanceRosterRowDTO {
  userId: string;
  employeeName: string;
  email: string;
  designation?: string;
  status: RosterStatus;
  checkInAt?: string;
  checkOutAt?: string;
  workedMinutes: number;
}

export interface AttendanceRosterDTO {
  date: string; // YYYY-MM-DD
  /** True when the whole day is a weekend or public holiday. */
  nonWorking: boolean;
  /** Human label for a non-working day (e.g. "Weekend" or the holiday name). */
  nonWorkingReason?: string;
  counts: {
    present: number;
    halfDay: number;
    absent: number;
    onLeave: number;
    notCheckedIn: number;
    weekOff: number;
    holiday: number;
  };
  rows: AttendanceRosterRowDTO[];
}

/** Outcome of an auto-absent sweep (manual run or scheduled). */
export interface AutoAbsentRunResultDTO {
  date: string;
  ran: boolean;
  skipped?: string;
  markedAbsent: number;
  notified: number;
}

/** Report period selector for attendance summaries/exports. */
export type AttendancePeriod = '1w' | '2w' | '1m' | '3m' | '6m' | '1y';

/** One week's aggregate for a person (Monday–Sunday). */
export interface WeekSummaryDTO {
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string; // Sunday YYYY-MM-DD
  workedMinutes: number;
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  holiday: number;
  weekOff: number;
  /** The week has fully elapsed (its Sunday is before today). */
  complete: boolean;
  /** Completed week whose worked minutes fell below the weekly minimum. */
  short: boolean;
}

/** Last-N-weeks breakdown for a single person (accordion / drill-down). */
export interface PersonWeeksDTO {
  userId: string;
  employeeName: string;
  weeklyMinimumMinutes: number;
  weeks: WeekSummaryDTO[]; // most-recent first
}

/** One person's roll-up across the report period. */
export interface AttendanceReportRowDTO {
  userId: string;
  employeeName: string;
  email: string;
  designation?: string;
  totalWorkedMinutes: number;
  avgWeeklyMinutes: number;
  daysPresent: number; // present + half
  daysAbsent: number;
  daysOnLeave: number;
  shortWeeks: number; // completed weeks below the minimum
  completedWeeks: number;
}

/** Period report for everyone in scope, with top/lowest performers. */
export interface AttendanceReportDTO {
  period: AttendancePeriod;
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive, = today)
  weeklyMinimumMinutes: number;
  rows: AttendanceReportRowDTO[];
  top: AttendanceReportRowDTO[]; // up to 3, most hours first
  lowest: AttendanceReportRowDTO[]; // up to 3, fewest hours first
}

export interface HolidayDTO {
  id: string;
  date: string;
  name: string;
}

export interface RegularizationDTO {
  id: string;
  userId: string;
  employeeName?: string;
  date: string;
  requestedCheckInAt: string;
  requestedCheckOutAt: string;
  reason: string;
  status: LeaveRequestStatus;
  approverId?: string;
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
  createdAt: string;
}

/** An attendance row enriched with the employee's name (for team views). */
export interface TeamAttendanceDTO extends AttendanceDTO {
  employeeName: string;
  email: string;
}
