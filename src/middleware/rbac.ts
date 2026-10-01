import type { RequestHandler } from 'express';
import { ORG_ROLE_RANK, isOwner, type OrgRole } from '@ems/types';
import { ForbiddenError, UnauthorizedError } from '../common/errors';

export interface RbacRule {
  /** Minimum Employee org role required (Owner accountType always passes). */
  minOrgRole?: OrgRole;
  /** Restrict to Owner accountType only (org-lifecycle actions). */
  ownerOnly?: boolean;
}

/**
 * Enforce the two-dimension role model (PLAN.md §9). This M0 scaffold covers the
 * accountType/orgRole gate; full per-resource SCOPE resolution (self/team/org)
 * lands in M1 with real authentication.
 */
export const authorize =
  (rule: RbacRule = {}): RequestHandler =>
  (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    if (rule.ownerOnly && !isOwner(user)) {
      next(new ForbiddenError('This action is restricted to Owner accounts.'));
      return;
    }
    if (
      rule.minOrgRole &&
      !isOwner(user) &&
      ORG_ROLE_RANK[user.orgRole] < ORG_ROLE_RANK[rule.minOrgRole]
    ) {
      next(new ForbiddenError('Insufficient organizational role for this action.'));
      return;
    }
    next();
  };
