import type { ExpenseClaimStatus } from '@ems/types';

/** Effective per-claim limit: a category override (>0) wins, else the policy
 *  default. 0 means unlimited. */
export function effectiveLimit(categoryLimit: number, policyDefault: number): number {
  return categoryLimit > 0 ? categoryLimit : policyDefault;
}

/** True when `amount` breaches a positive limit (0 = unlimited never breaches). */
export function exceedsLimit(amount: number, limit: number): boolean {
  return limit > 0 && amount > limit;
}

/** Allowed status transitions for an expense claim's lifecycle. */
const TRANSITIONS: Record<ExpenseClaimStatus, ExpenseClaimStatus[]> = {
  Draft: ['Submitted'],
  Submitted: ['Approved', 'Rejected'],
  Approved: ['Reimbursed'],
  Rejected: [],
  Reimbursed: [],
};

export function canTransition(from: ExpenseClaimStatus, to: ExpenseClaimStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
