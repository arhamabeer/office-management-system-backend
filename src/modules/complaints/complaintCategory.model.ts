import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A configurable complaint category (Workplace, Facilities, IT, …).
 *  Editable on Complaints → Settings; seeded with sensible defaults. */
const complaintCategorySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ComplaintCategoryDoc = HydratedDocument<InferSchemaType<typeof complaintCategorySchema>>;
export const ComplaintCategory = model('ComplaintCategory', complaintCategorySchema);
