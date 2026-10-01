import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Singleton expense policy. `defaultPerClaimLimit` 0 = unlimited. */
const expensePolicySchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    currency: { type: String, default: 'PKR' },
    requireApprovalByDefault: { type: Boolean, default: true },
    defaultPerClaimLimit: { type: Number, default: 0 },
    twoStepApproval: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type ExpensePolicyDoc = HydratedDocument<InferSchemaType<typeof expensePolicySchema>>;
export const ExpensePolicy = model('ExpensePolicy', expensePolicySchema);
