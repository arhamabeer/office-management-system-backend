import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { REVIEW_CYCLE_STATUSES } from '@ems/types';

/** A performance review period (e.g. "H2 2026") created by an admin. Goals and
 *  manager reviews are grouped under a cycle. */
const reviewCycleSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },
    status: { type: String, enum: REVIEW_CYCLE_STATUSES, default: 'Open', index: true },
  },
  { timestamps: true },
);

export type ReviewCycleDoc = HydratedDocument<InferSchemaType<typeof reviewCycleSchema>>;
export const ReviewCycle = model('ReviewCycle', reviewCycleSchema);
