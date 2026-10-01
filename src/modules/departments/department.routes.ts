import { Router } from 'express';
import { createDepartmentSchema, updateDepartmentSchema, idParamSchema } from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './department.controller';

const router = Router();

router.use(requireAuth);

router.get('/', c.listDepartmentsHandler);
router.post(
  '/',
  authorize({ minOrgRole: 'Admin' }),
  validate({ body: createDepartmentSchema }),
  c.createDepartmentHandler,
);
router.patch(
  '/:id',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema, body: updateDepartmentSchema }),
  c.updateDepartmentHandler,
);
router.delete(
  '/:id',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: idParamSchema }),
  c.deleteDepartmentHandler,
);

export default router;
