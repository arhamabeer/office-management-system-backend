/**
 * Feature-flag keys — the hook surface the (deferred) console-dashboard will
 * toggle at runtime via the `FeatureFlag` collection (PLAN.md §2, §7).
 * Defaults here; runtime state is stored per-org in the DB.
 */

export const FEATURE_FLAGS = {
  /** Allow Managers/Leads to view their team's salary (off = least-privilege default). */
  MANAGER_TEAM_SALARY_VIEW: 'manager_team_salary_view',
  /** Two-step leave approval (Lead → Manager) instead of single-step. */
  LEAVE_TWO_STEP_APPROVAL: 'leave_two_step_approval',
  /** Enable leave encashment. */
  LEAVE_ENCASHMENT: 'leave_encashment',
  /** Surface multi-shift scheduling. */
  MULTI_SHIFT: 'multi_shift',
  /** Enable biometric attendance import pipeline. */
  BIOMETRIC_IMPORT: 'biometric_import',
  /** Enforce geofence/IP restriction on attendance punches. */
  ATTENDANCE_GEOFENCE: 'attendance_geofence',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const ALL_FEATURE_FLAG_KEYS: FeatureFlagKey[] = Object.values(FEATURE_FLAGS);

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.MANAGER_TEAM_SALARY_VIEW]: false,
  [FEATURE_FLAGS.LEAVE_TWO_STEP_APPROVAL]: false,
  [FEATURE_FLAGS.LEAVE_ENCASHMENT]: false,
  [FEATURE_FLAGS.MULTI_SHIFT]: false,
  [FEATURE_FLAGS.BIOMETRIC_IMPORT]: false,
  [FEATURE_FLAGS.ATTENDANCE_GEOFENCE]: false,
};
