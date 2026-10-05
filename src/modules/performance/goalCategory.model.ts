import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A configurable goal category (Delivery, Growth, Collaboration, …).
 *  Editable on Performance → Settings; seeded with sensible defaults. */
const goalCategorySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type GoalCategoryDoc = HydratedDocument<InferSchemaType<typeof goalCategorySchema>>;
export const GoalCategory = model('GoalCategory', goalCategorySchema);
