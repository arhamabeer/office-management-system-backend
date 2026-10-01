import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { LEAVE_REQUEST_STATUSES } from '@ems/types';

/** A leave application and its approval state (PLAN.md §7, §9). */
const leaveRequestSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    typeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true, index: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: 'Pending', index: true },
    approverId: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    comment: { type: String },
  },
  { timestamps: true },
);

export type LeaveRequestDoc = HydratedDocument<InferSchemaType<typeof leaveRequestSchema>>;
export const LeaveRequest = model('LeaveRequest', leaveRequestSchema);
