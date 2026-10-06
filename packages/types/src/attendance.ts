import type {
  AttendanceStatus,
  AttendanceSource,
  LeaveRequestStatus,
  RegularizationKind,
  RequestRouteTarget,
  BiometricDeviceStatus,
} from './enums';

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
  /** Correction (fix a record) vs DeviceDown (device-off self-report). */
  kind: RegularizationKind;
  date: string;
  requestedCheckInAt: string;
  /** Optional for a DeviceDown report where the employee only checked in. */
  requestedCheckOutAt?: string;
  reason: string;
  status: LeaveRequestStatus;
  /** Handler queues this request is routed to (empty = a specific manager). */
  routedTo: RequestRouteTarget[];
  approverId?: string;
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
  createdAt: string;
}

/** A single raw punch received from a biometric terminal (ADMS/push), kept for
 *  audit + dedupe; the daily Attendance record is derived from these. */
export interface RawPunchDTO {
  id: string;
  deviceSerial: string;
  /** The on-device enrollment id (PIN) the employee punched with. */
  pin: string;
  timestamp: string; // ISO instant
  dayKey: string; // YYYY-MM-DD in the office timezone
  status?: number;
  verify?: number;
  /** The resolved employee, or undefined when the PIN isn't mapped yet. */
  matchedUserId?: string;
  employeeName?: string;
  createdAt: string;
}

/** A biometric terminal known to us, keyed by its serial number. */
export interface BiometricDeviceDTO {
  id: string;
  serial: string;
  label?: string;
  status: BiometricDeviceStatus;
  lastSeenAt?: string;
  lastPunchAt?: string;
  punchCount: number;
  firmware?: string;
  ipHint?: string;
  createdAt: string;
}

/** An unmapped PIN seen on a device, with how many punches are waiting on it. */
export interface UnmappedPinDTO {
  deviceSerial: string;
  pin: string;
  punchCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface DeviceReconcileResultDTO {
  from: string;
  to: string;
  daysRederived: number;
  punchesConsidered: number;
}

/** An attendance row enriched with the employee's name (for team views). */
export interface TeamAttendanceDTO extends AttendanceDTO {
  employeeName: string;
  email: string;
}
