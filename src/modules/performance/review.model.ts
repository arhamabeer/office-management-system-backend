import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { REVIEW_STATUSES } from '@ems/types';

/** A manager's appraisal of an employee for a review cycle. One per
 *  (employee, cycle) — enforced by the unique compound index. Private Draft
 *  until the manager Shares it with the employee. */
const reviewSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the employee
    cycleId: { type: Schema.Types.ObjectId, ref: 'ReviewCycle', required: true, index: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number },
    comments: { type: String },
    strengths: { type: String },
    improvements: { type: String },
    status: { type: String, enum: REVIEW_STATUSES, default: 'Draft', index: true },
    sharedAt: { type: Date },
  },
  { timestamps: true },
);

reviewSchema.index({ userId: 1, cycleId: 1 }, { unique: true });

export type ReviewDoc = HydratedDocument<InferSchemaType<typeof reviewSchema>>;
export const Review = model('Review', reviewSchema);
