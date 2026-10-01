import { Router } from 'express';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  assignRoleSchema,
  listEmployeesQuerySchema,
  idParamSchema,
  resendInviteSchema,
  importEmployeesSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './employee.controller';

const router = Router();

// All employee routes require authentication.
router.use(requireAuth);

router.get('/', validate({ query: listEmployeesQuerySchema }), c.listEmployeesHandler);
router.get('/:id', validate({ params: idParamSchema }), c.getEmployeeHandler);

// Create / onboard — Admin (org) or Owner only.
router.post(
  '/',
  authorize({ minOrgRole: 'Admin' }),
  validate({ body: createEmployeeSchema }),
  c.createEmployeeHandler,
);
// Bulk import from CSV — Admin (org) or Owner only.
router.post(
  '/import',
  authorize({ minOrgRole: 'Admin' }),
  validate({ body: importEmployeesSchema }),
  c.importEmployeesHandler,
);

// Update profile — scope enforced in the service (self / team / org).
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateEmployeeSchema }),
  c.updateEmployeeHandler,
);

// Role assignment — Admin/Owner; Owner-only for Admin/Owner grants (service-enforced). Audited.
router.patch(
  '/:id/role',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema, body: assignRoleSchema }),
  c.assignRoleHandler,
);

// Deactivate (soft) — Admin/Owner.
router.delete(
  '/:id',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema }),
  c.deactivateEmployeeHandler,
);

// Resend / copy onboarding link (Admin/Owner). notify=false only regenerates.
router.post(
  '/:id/resend-invite',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema, body: resendInviteSchema }),
  c.resendInviteHandler,
);

export default router;
