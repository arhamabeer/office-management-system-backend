import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { LEAVE_REQUEST_STATUSES, REGULARIZATION_KINDS } from '@ems/types';

/** Attendance-approval request, decided by a manager (PLAN.md §16.3).
 *  kind = 'Correction' (fix a record) or 'DeviceDown' (self-report when the
 *  biometric device was off). requestedCheckOutAt is optional for the latter. */
const regularizationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: REGULARIZATION_KINDS, default: 'Correction' },
    date: { type: String, required: true },
    requestedCheckInAt: { type: Date, required: true },
    requestedCheckOutAt: { type: Date },
    reason: { type: String, required: true },
    status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: 'Pending', index: true },
    approverId: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    comment: { type: String },
  },
  { timestamps: true },
);

export type RegularizationDoc = HydratedDocument<InferSchemaType<typeof regularizationSchema>>;
export const Regularization = model('Regularization', regularizationSchema);
