import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A configurable expense category (Travel, Meals, …). `perClaimLimit` 0 = unlimited. */
const expenseCategorySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    perClaimLimit: { type: Number, default: 0 }, // whole currency units; 0 = unlimited
    requiresApproval: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ExpenseCategoryDoc = HydratedDocument<InferSchemaType<typeof expenseCategorySchema>>;
export const ExpenseCategory = model('ExpenseCategory', expenseCategorySchema);
