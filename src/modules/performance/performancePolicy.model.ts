import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Singleton performance policy: the tunable rating scale (used by reviews) and
 *  options. Business values live here as data — never hardcoded in logic. */
const ratingLevelSchema = new Schema(
  {
    value: { type: Number, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const performancePolicySchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    ratingLevels: { type: [ratingLevelSchema], default: [] },
    selfReviewEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type PerformancePolicyDoc = HydratedDocument<InferSchemaType<typeof performancePolicySchema>>;
export const PerformancePolicy = model('PerformancePolicy', performancePolicySchema);
