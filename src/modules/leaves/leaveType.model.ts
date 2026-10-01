import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A configurable leave type (Annual, Sick, …) — PLAN.md §16.2. */
const leaveTypeSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    defaultQuota: { type: Number, required: true, default: 0 },
    paid: { type: Boolean, default: true },
    requiresApproval: { type: Boolean, default: true },
    color: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type LeaveTypeDoc = HydratedDocument<InferSchemaType<typeof leaveTypeSchema>>;
export const LeaveType = model('LeaveType', leaveTypeSchema);
