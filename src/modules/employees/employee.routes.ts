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

// Create / onboard — Manager, Admin or Owner. Managers may only create
// Member/Lead accounts (enforced in the service via assertCanAssignRole).
router.post(
  '/',
  authorize({ minOrgRole: 'Manager' }),
  validate({ body: createEmployeeSchema }),
  c.createEmployeeHandler,
);
// Bulk import from CSV — Manager, Admin or Owner.
router.post(
  '/import',
  authorize({ minOrgRole: 'Manager' }),
  validate({ body: importEmployeesSchema }),
  c.importEmployeesHandler,
);

// Update profile — scope enforced in the service (self / team / org).
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateEmployeeSchema }),
  c.updateEmployeeHandler,
);

// Role assignment — Manager+. Managers may assign Member/Lead only and cannot
// modify Manager/Admin/Owner accounts; granting Admin/Owner stays Owner-only
// (all service-enforced). Audited.
router.patch(
  '/:id/role',
  authorize({ minOrgRole: 'Manager' }),
  validate({ params: idParamSchema, body: assignRoleSchema }),
  c.assignRoleHandler,
);

// Deactivate (soft) — Admin/Owner only.
router.delete(
  '/:id',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema }),
  c.deactivateEmployeeHandler,
);

// Resend / copy onboarding link — Manager, Admin or Owner. notify=false only regenerates.
router.post(
  '/:id/resend-invite',
  authorize({ minOrgRole: 'Manager' }),
  validate({ params: idParamSchema, body: resendInviteSchema }),
  c.resendInviteHandler,
);

export default router;
