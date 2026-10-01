import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { LEAVE_REQUEST_STATUSES } from '@ems/types';

/** Attendance-correction request, approved by a manager (PLAN.md §16.3). */
const regularizationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    requestedCheckInAt: { type: Date, required: true },
    requestedCheckOutAt: { type: Date, required: true },
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
