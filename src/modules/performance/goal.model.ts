import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { GOAL_STATUSES } from '@ems/types';

/** An employee performance goal. Drafted by the employee, approved by their
 *  manager, then progressed to completion (see GOAL_STATUSES). */
const goalSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cycleId: { type: Schema.Types.ObjectId, ref: 'ReviewCycle', index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'GoalCategory' },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    weight: { type: Number },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    status: { type: String, enum: GOAL_STATUSES, default: 'Draft', index: true },
    dueDate: { type: String }, // YYYY-MM-DD
    decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String },
  },
  { timestamps: true },
);

export type GoalDoc = HydratedDocument<InferSchemaType<typeof goalSchema>>;
export const Goal = model('Goal', goalSchema);
