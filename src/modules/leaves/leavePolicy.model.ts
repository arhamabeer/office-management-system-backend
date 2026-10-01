import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Singleton leave policy (PLAN.md §16.2). */
const leavePolicySchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    leaveYear: { type: String, enum: ['calendar', 'fiscal'], default: 'calendar' },
    accrualMode: { type: String, enum: ['upfront', 'monthly'], default: 'upfront' },
    carryForwardCap: { type: Number, default: 10 },
    encashment: { type: Boolean, default: false },
    probationMonths: { type: Number, default: 3 },
    probationSickOnly: { type: Boolean, default: true },
    twoStepApproval: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type LeavePolicyDoc = HydratedDocument<InferSchemaType<typeof leavePolicySchema>>;
export const LeavePolicy = model('LeavePolicy', leavePolicySchema);
