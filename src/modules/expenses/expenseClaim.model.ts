import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { EXPENSE_CLAIM_STATUSES } from '@ems/types';

/** An expense claim and its approval/reimbursement state. Amount is in whole
 *  units of `currency` (PKR); `receiptRef` is a text reference only. */
const expenseClaimSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'PKR' },
    incurredOn: { type: String, required: true }, // YYYY-MM-DD
    description: { type: String, required: true },
    receiptRef: { type: String },
    status: { type: String, enum: EXPENSE_CLAIM_STATUSES, default: 'Submitted', index: true },
    submittedAt: { type: Date },
    decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String },
    reimbursedById: { type: Schema.Types.ObjectId, ref: 'User' },
    reimbursedAt: { type: Date },
  },
  { timestamps: true },
);

export type ExpenseClaimDoc = HydratedDocument<InferSchemaType<typeof expenseClaimSchema>>;
export const ExpenseClaim = model('ExpenseClaim', expenseClaimSchema);
