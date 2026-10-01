import { describe, it, expect } from 'vitest';
import { effectiveLimit, exceedsLimit, canTransition } from '../src/modules/expenses/expenses.util';

describe('expenses util', () => {
  it('effectiveLimit prefers a positive category override, else the policy default', () => {
    expect(effectiveLimit(5000, 2000)).toBe(5000);
    expect(effectiveLimit(0, 2000)).toBe(2000); // 0 = no category override
    expect(effectiveLimit(0, 0)).toBe(0); // both unlimited
  });

  it('exceedsLimit treats a zero limit as unlimited', () => {
    expect(exceedsLimit(10_000, 0)).toBe(false);
    expect(exceedsLimit(10_000, 5000)).toBe(true);
    expect(exceedsLimit(5000, 5000)).toBe(false); // equal is allowed
  });

  it('canTransition enforces the claim lifecycle', () => {
    expect(canTransition('Draft', 'Submitted')).toBe(true);
    expect(canTransition('Submitted', 'Approved')).toBe(true);
    expect(canTransition('Submitted', 'Rejected')).toBe(true);
    expect(canTransition('Approved', 'Reimbursed')).toBe(true);
    // illegal jumps
    expect(canTransition('Submitted', 'Reimbursed')).toBe(false);
    expect(canTransition('Draft', 'Approved')).toBe(false);
    expect(canTransition('Rejected', 'Approved')).toBe(false);
    expect(canTransition('Reimbursed', 'Approved')).toBe(false);
    expect(canTransition('Approved', 'Rejected')).toBe(false);
  });
});
