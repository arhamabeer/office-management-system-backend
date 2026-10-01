import { Schema, model, type InferSchemaType } from 'mongoose';

/** Per-org runtime configuration overrides — the console-dashboard hook surface
 *  (PLAN.md §2, §7). Complements the build-time defaults in @ems/config. */
const appConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed },
    description: { type: String },
  },
  { timestamps: true },
);

export type AppConfigDoc = InferSchemaType<typeof appConfigSchema>;
export const AppConfig = model('AppConfig', appConfigSchema);
