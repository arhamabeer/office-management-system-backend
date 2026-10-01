import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './approvals.controller';

const router = Router();
router.use(requireAuth);

// Pending-approval count for the sidebar badge + inbox header (approvers only).
// The inbox itself reuses the existing regularization + leave-request list and
// decision endpoints — this is the only new approvals route.
router.get('/count', authorize({ minOrgRole: 'Lead' }), c.countHandler);

export default router;
