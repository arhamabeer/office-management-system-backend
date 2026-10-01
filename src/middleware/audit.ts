import type { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../common/logger';

export interface AuditInput {
  action: string;
  actorId?: string;
  actorLabel?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}

/** Persist an audit entry (PLAN.md §12.3). Failures are logged but never break
 *  the primary request flow. Sensitive actions (salary access, role changes,
 *  tax-cert downloads, config edits) call this from their services in M1–M4. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create(input);
  } catch (err) {
    logger.error({ err, action: input.action }, 'Failed to write audit log');
  }
}

/** Build an AuditInput from the request context (actor + ip) plus extras. */
export function auditFromReq(
  req: Request,
  action: string,
  extra: Partial<AuditInput> = {},
): AuditInput {
  return {
    action,
    actorId: req.user?.id,
    actorLabel: req.user?.email,
    ip: req.ip,
    ...extra,
  };
}
