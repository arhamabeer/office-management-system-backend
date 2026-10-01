import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ATTENDANCE_STATUSES, ATTENDANCE_SOURCES } from '@ems/types';

/** One attendance record per user per day (PLAN.md §7). */
const attendanceSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (local day)
    checkInAt: { type: Date },
    checkOutAt: { type: Date },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'Present' },
    source: { type: String, enum: ATTENDANCE_SOURCES, default: 'SelfWeb' },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    note: { type: String },
    ip: { type: String },
    geo: { lat: { type: Number }, lng: { type: Number } },
    createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

export type AttendanceDoc = HydratedDocument<InferSchemaType<typeof attendanceSchema>>;
export const Attendance = model('Attendance', attendanceSchema);
