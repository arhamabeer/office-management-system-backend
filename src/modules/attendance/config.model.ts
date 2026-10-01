import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Singleton attendance policy (working hours, shift, week-off) — configurable
 *  data, editable later by the console-dashboard (PLAN.md §16.3). */
const attendancePolicySchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    workdayMinutes: { type: Number, default: 480 }, // full day = 8h worked
    halfDayMinutes: { type: Number, default: 240 }, // half day threshold = 4h
    shiftStart: { type: String, default: '09:00' },
    shiftEnd: { type: String, default: '18:00' },
    weekOff: { type: [Number], default: [0, 6] }, // Sun, Sat
    graceMinutes: { type: Number, default: 10 },
    // Office calendar timezone (IANA) — defines "today" for check-in and the
    // auto-absent sweep. Configurable; seeded to Asia/Karachi (PKT).
    timezone: { type: String, default: 'Asia/Karachi' },
    // Auto-absent: after the local cut-off, employees who haven't checked in on
    // a working day are marked Absent and emailed.
    autoAbsentEnabled: { type: Boolean, default: true },
    autoAbsentCutoff: { type: String, default: '13:00' }, // HH:MM in `timezone`
    // Minimum worked minutes per week; a completed week under this is "Short".
    weeklyMinimumMinutes: { type: Number, default: 2700 }, // 45h
    // Internal idempotency marker — the last YYYY-MM-DD the sweep completed.
    autoAbsentLastRunDate: { type: String },
  },
  { timestamps: true },
);

export type AttendancePolicyDoc = HydratedDocument<InferSchemaType<typeof attendancePolicySchema>>;
export const AttendancePolicy = model('AttendancePolicy', attendancePolicySchema);

const holidaySchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    name: { type: String, required: true },
  },
  { timestamps: true },
);

export type HolidayDoc = HydratedDocument<InferSchemaType<typeof holidaySchema>>;
export const Holiday = model('Holiday', holidaySchema);
