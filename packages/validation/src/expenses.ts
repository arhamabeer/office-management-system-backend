import { z } from 'zod';
import { objectIdSchema } from './common';

/** Whole-currency-unit amount (PKR), capped to a sane maximum. */
const amountSchema = z.number().int().positive().max(100_000_000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');
const notFuture = (d: string) => d <= new Date().toISOString().slice(0, 10);

// ---- categories (config) ----

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(20),
  perClaimLimit: z.number().int().min(0).max(100_000_000).optional(),
  requiresApproval: z.boolean().optional(),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  perClaimLimit: z.number().int().min(0).max(100_000_000).optional(),
  requiresApproval: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

// ---- policy (config) ----

export const updateExpensePolicySchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().optional(),
  requireApprovalByDefault: z.boolean().optional(),
  defaultPerClaimLimit: z.number().int().min(0).max(100_000_000).optional(),
  twoStepApproval: z.boolean().optional(),
});
export type UpdateExpensePolicyInput = z.infer<typeof updateExpensePolicySchema>;

// ---- claims ----

export const createExpenseClaimSchema = z.object({
  categoryId: objectIdSchema,
  amount: amountSchema,
  incurredOn: dateSchema.refine(notFuture, 'Expense date cannot be in the future'),
  description: z.string().trim().min(1).max(500),
  receiptRef: z.string().trim().max(500).optional(),
  /** false saves a Draft; omitted/true submits for approval. */
  submit: z.boolean().optional(),
});
export type CreateExpenseClaimInput = z.infer<typeof createExpenseClaimSchema>;

export const expenseDecisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type ExpenseDecisionInput = z.infer<typeof expenseDecisionSchema>;

export const expenseClaimsQuerySchema = z.object({
  scope: z.enum(['mine', 'pending', 'team']).default('mine'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type ExpenseClaimsQuery = z.infer<typeof expenseClaimsQuerySchema>;
