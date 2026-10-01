import { Router } from 'express';
import { auditLogQuerySchema } from '@ems/validation';
import type { AuditLogQuery } from '@ems/validation';
import { asyncHandler } from '../../common/asyncHandler';
import { sendPage } from '../../common/httpResponse';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { listAuditLogs } from './audit.service';

const router = Router();

// Owner/Admin only — the audit trail is sensitive.
router.get(
  '/',
  requireAuth,
  authorize({ minOrgRole: 'Admin' }),
  validate({ query: auditLogQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listAuditLogs(req.query as unknown as AuditLogQuery);
    sendPage(res, result.items, result.meta);
  }),
);

export default router;
