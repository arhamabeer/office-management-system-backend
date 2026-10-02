/**
 * The two-dimension role model (PLAN.md §1 & §9).
 * Every user carries exactly one `AccountType` AND one `OrgRole`.
 * These are independent dimensions, not a single hierarchy.
 */

export const ACCOUNT_TYPES = ['Owner', 'Employee'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ORG_ROLES = ['Admin', 'Manager', 'Lead', 'Member', 'Operations'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export interface RolePair {
  accountType: AccountType;
  orgRole: OrgRole;
}

/**
 * Ranking among Employee organizational roles. Higher = more authority.
 * NOTE: `Owner` accountType dominates unconditionally regardless of this rank
 * (see PLAN.md §9 "How the two dimensions combine").
 */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  Admin: 4,
  Manager: 3,
  Lead: 2,
  Member: 1,
  // `Operations` is a FUNCTIONAL handler role (receives complaints/inventory
  // requests forwarded by a manager), not a seniority tier. It is ranked at
  // Member level on purpose so the generic `authorize({ minOrgRole })` ladder
  // never grants it Lead/Manager approval powers; its handler-queue access is
  // granted explicitly (orgRole === 'Operations' || Owner/Admin), never by rank.
  Operations: 1,
};

/** Privileged org roles that only an Owner/Admin may assign to someone
 *  (a Manager can only move people to/from Member/Lead). */
export const ADMIN_ASSIGNABLE_ORG_ROLES: readonly OrgRole[] = ['Manager', 'Admin', 'Operations'];

/** Access scope a permission can resolve to (PLAN.md §9). */
export const ACCESS_SCOPES = ['org', 'team', 'self', 'none'] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

export function isOwner(p: Pick<RolePair, 'accountType'>): boolean {
  return p.accountType === 'Owner';
}

export function isAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[min];
}
