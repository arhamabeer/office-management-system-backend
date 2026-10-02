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

/** Why an attendance-approval request was raised. 'Correction' = fix a wrong/
 *  missing record; 'DeviceDown' = the biometric device was off (power cut etc.)
 *  so the employee is self-reporting their attendance for manager approval. */
export const REGULARIZATION_KINDS = ['Correction', 'DeviceDown'] as const;
export type RegularizationKind = (typeof REGULARIZATION_KINDS)[number];

/** Allowlist state of a biometric terminal that talks to us over ADMS/push.
 *  A newly-seen device is 'Pending' (its punches are stored but NOT turned into
 *  attendance until an admin 'Enabled's it); 'Disabled' devices are ignored. */
export const BIOMETRIC_DEVICE_STATUSES = ['Pending', 'Enabled', 'Disabled'] as const;
export type BiometricDeviceStatus = (typeof BIOMETRIC_DEVICE_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = ['Draft', 'Processing', 'Finalized', 'Paid'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const EXPENSE_CLAIM_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Reimbursed'] as const;
export type ExpenseClaimStatus = (typeof EXPENSE_CLAIM_STATUSES)[number];

/**
 * Shared lifecycle for routable requests (complaints, inventory requests).
 * 'Submitted' → a manager picks one of the REQUEST_ACTIONS → 'Forwarded'
 * (accepted and routed to Operations and/or Admin) → a handler resolves/rejects.
 * 'Resolved' / 'Rejected' are terminal.
 */
export const REQUEST_STATUSES = ['Submitted', 'Forwarded', 'Resolved', 'Rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Downstream handler queues a manager can forward an accepted request to. */
export const REQUEST_ROUTE_TARGETS = ['Operations', 'Admin'] as const;
export type RequestRouteTarget = (typeof REQUEST_ROUTE_TARGETS)[number];

/**
 * Every action that can be taken on a request.
 * Manager stage (status 'Submitted'): resolve | reject | forward_operations |
 *   forward_admin | forward_both.
 * Handler stage (status 'Forwarded'): resolve | reject; Operations may also
 *   forward_admin if it will neither resolve nor reject.
 */
export const REQUEST_ACTIONS = [
  'resolve',
  'reject',
  'forward_operations',
  'forward_admin',
  'forward_both',
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

/** Actions recorded in a request's timeline: the decision actions plus the
 *  initial 'submitted' (filing) event. */
export const REQUEST_TIMELINE_ACTIONS = ['submitted', ...REQUEST_ACTIONS] as const;
export type RequestTimelineAction = (typeof REQUEST_TIMELINE_ACTIONS)[number];
