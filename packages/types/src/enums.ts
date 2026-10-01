/** Shared domain enums. Business-rule specifics (leave types, tax slabs, salary
 *  components) are configurable data, not hardcoded — these are only the fixed
 *  system-level enumerations. */

export const EMPLOYMENT_TYPES = [
  'FullTime',
  'PartTime',
  'Contract',
  'Intern',
  'Probation',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const USER_STATUSES = ['Invited', 'Active', 'Suspended', 'Deactivated'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  'Present',
  'Absent',
  'HalfDay',
  'OnLeave',
  'Holiday',
  'WeekOff',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_SOURCES = [
  'SelfWeb',
  'SelfMobile',
  'AdminEntry',
  'BiometricImport',
  'System', // set by the auto-absent job — never accepted as user input
] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const LEAVE_REQUEST_STATUSES = [
  'Pending',
  'Approved',
  'Rejected',
  'Cancelled',
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = ['Draft', 'Processing', 'Finalized', 'Paid'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const EXPENSE_CLAIM_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Reimbursed'] as const;
export type ExpenseClaimStatus = (typeof EXPENSE_CLAIM_STATUSES)[number];
