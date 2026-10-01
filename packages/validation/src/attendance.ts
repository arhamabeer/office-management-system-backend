import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

const ATTENDANCE_SOURCES = ['SelfWeb', 'SelfMobile', 'AdminEntry', 'BiometricImport'] as const;
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'HalfDay', 'OnLeave', 'Holiday', 'WeekOff'] as const;

export const geoSchema = z.object({ lat: z.number(), lng: z.number() });

export const checkInSchema = z.object({
  source: z.enum(ATTENDANCE_SOURCES).optional(),
  note: z.string().trim().max(280).optional(),
  geo: geoSchema.optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  note: z.string().trim().max(280).optional(),
  geo: geoSchema.optional(),
});
export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const adminEntrySchema = z.object({
  userId: objectIdSchema,
  date: dayKey,
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  note: z.string().trim().max(280).optional(),
});
export type AdminEntryInput = z.infer<typeof adminEntrySchema>;

export const monthQuerySchema = z.object({ month: monthKey.optional() });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

export const teamAttendanceQuerySchema = paginationQuerySchema.extend({
  month: monthKey.optional(),
  date: dayKey.optional(),
  departmentId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
});
export type TeamAttendanceQuery = z.infer<typeof teamAttendanceQuerySchema>;

export const regularizationCreateSchema = z
  .object({
    date: dayKey,
    checkInAt: z.coerce.date(),
    checkOutAt: z.coerce.date(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => v.checkOutAt > v.checkInAt, {
    message: 'Check-out must be after check-in',
    path: ['checkOutAt'],
  });
export type RegularizationCreateInput = z.infer<typeof regularizationCreateSchema>;

export const regularizationDecisionSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});
export type RegularizationDecisionInput = z.infer<typeof regularizationDecisionSchema>;

export const regularizationListQuerySchema = z.object({
  scope: z.enum(['mine', 'pending']).default('mine'),
});
export type RegularizationListQuery = z.infer<typeof regularizationListQuerySchema>;

/** A valid IANA timezone string (e.g. "Asia/Karachi") — rejected if the host
 *  Intl runtime doesn't recognise it. */
const timezone = z.string().trim().min(1).max(64).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Expected a valid IANA timezone, e.g. Asia/Karachi' },
);

export const attendancePolicySchema = z.object({
  workdayMinutes: z.number().int().min(1).max(1440),
  halfDayMinutes: z.number().int().min(1).max(1440),
  shiftStart: hhmm,
  shiftEnd: hhmm,
  weekOff: z.array(z.number().int().min(0).max(6)).max(7),
  graceMinutes: z.number().int().min(0).max(240),
  timezone,
  autoAbsentEnabled: z.boolean(),
  autoAbsentCutoff: hhmm,
  weeklyMinimumMinutes: z.number().int().min(0).max(10080), // ≤ 168h/week
});
export const updateAttendancePolicySchema = attendancePolicySchema.partial();
export type UpdateAttendancePolicyInput = z.infer<typeof updateAttendancePolicySchema>;

export const rosterQuerySchema = z.object({ date: dayKey.optional() });
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const autoAbsentRunSchema = z.object({ force: z.boolean().optional() });
export type AutoAbsentRunInput = z.infer<typeof autoAbsentRunSchema>;

const attendancePeriod = z.enum(['1w', '2w', '1m', '3m', '6m', '1y']);

export const attendanceReportQuerySchema = z.object({
  period: attendancePeriod.default('1m'),
});
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;

export const attendanceReportExportQuerySchema = z.object({
  period: attendancePeriod.default('1m'),
  format: z.enum(['pdf', 'xlsx']).default('xlsx'),
});
export type AttendanceReportExportQuery = z.infer<typeof attendanceReportExportQuerySchema>;

export const personWeeksQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(52).default(4),
});
export type PersonWeeksQuery = z.infer<typeof personWeeksQuerySchema>;

export const holidaySchema = z.object({
  date: dayKey,
  name: z.string().trim().min(1).max(120),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(3000).optional(),
});
export type YearQuery = z.infer<typeof yearQuerySchema>;
