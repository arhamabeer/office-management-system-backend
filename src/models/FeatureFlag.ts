import { Schema, model, type InferSchemaType } from 'mongoose';

/** Feature flags toggled by the (deferred) console-dashboard (PLAN.md §2, §7).
 *  Keys are defined in @ems/config `FEATURE_FLAGS`. */
const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    description: { type: String },
  },
  { timestamps: true },
);

export type FeatureFlagDoc = InferSchemaType<typeof featureFlagSchema>;
export const FeatureFlag = model('FeatureFlag', featureFlagSchema);
