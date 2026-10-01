import type { ExpenseClaimStatus } from './enums';

/** A configurable expense category (Travel, Meals, …). `perClaimLimit` 0 = unlimited. */
export interface ExpenseCategoryDTO {
  id: string;
  name: string;
  code: string;
  perClaimLimit: number;
  requiresApproval: boolean;
  active: boolean;
}

/** Singleton expense policy. `defaultPerClaimLimit` 0 = unlimited. */
export interface ExpensePolicyDTO {
  currency: string;
  requireApprovalByDefault: boolean;
  defaultPerClaimLimit: number;
  twoStepApproval: boolean;
}

/** An expense claim and its lifecycle (Draft→Submitted→Approved|Rejected→Reimbursed).
 *  Amounts are whole units of {@link currency} (PKR). Receipts are a text
 *  reference/URL only — binary attachments are out of Phase 1 scope. */
export interface ExpenseClaimDTO {
  id: string;
  userId: string;
  employeeName?: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  currency: string;
  incurredOn: string; // YYYY-MM-DD
  description: string;
  receiptRef?: string;
  status: ExpenseClaimStatus;
  submittedAt?: string;
  decidedById?: string;
  decidedAt?: string;
  decisionNote?: string;
  reimbursedById?: string;
  reimbursedAt?: string;
  createdAt: string;
}
