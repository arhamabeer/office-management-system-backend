import { Router } from 'express';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  updateLeavePolicySchema,
  applyLeaveSchema,
  leaveDecisionSchema,
  leaveRequestsQuerySchema,
  leaveBalanceQuerySchema,
  leaveCalendarQuerySchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './leaves.controller';

const router = Router();
router.use(requireAuth);

// Leave types (Admin/Owner to mutate)
router.get('/types', c.listTypesHandler);
router.post('/types', authorize({ minOrgRole: 'Admin' }), validate({ body: createLeaveTypeSchema }), c.createTypeHandler);
router.patch('/types/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateLeaveTypeSchema }), c.updateTypeHandler);
router.delete('/types/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deactivateTypeHandler);

// Policy
router.get('/policy', c.getPolicyHandler);
router.put('/policy', authorize({ minOrgRole: 'Admin' }), validate({ body: updateLeavePolicySchema }), c.updatePolicyHandler);

// Balances + calendar
router.get('/balance', validate({ query: leaveBalanceQuerySchema }), c.balancesHandler);
router.get('/calendar', validate({ query: leaveCalendarQuerySchema }), c.calendarHandler);

// Requests
router.post('/requests', validate({ body: applyLeaveSchema }), c.applyHandler);
router.get('/requests', validate({ query: leaveRequestsQuerySchema }), c.listRequestsHandler);
router.get('/requests/export', validate({ query: leaveRequestsQuerySchema }), c.exportRequestsHandler);
router.patch('/requests/:id/cancel', validate({ params: idParamSchema }), c.cancelHandler);
router.patch('/requests/:id/approve', validate({ params: idParamSchema, body: leaveDecisionSchema }), c.approveHandler);
router.patch('/requests/:id/reject', validate({ params: idParamSchema, body: leaveDecisionSchema }), c.rejectHandler);

export default router;
