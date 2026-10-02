import { Router } from 'express';
import {
  createComplaintCategorySchema,
  updateComplaintCategorySchema,
  createComplaintSchema,
  requestDecisionSchema,
  requestScopeQuerySchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './complaints.controller';

const router = Router();
router.use(requireAuth);

// Categories — anyone may list (to file); Admin/Owner to mutate.
router.get('/categories', c.listCategoriesHandler);
router.post('/categories', authorize({ minOrgRole: 'Admin' }), validate({ body: createComplaintCategorySchema }), c.createCategoryHandler);
router.patch('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateComplaintCategorySchema }), c.updateCategoryHandler);
router.delete('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deactivateCategoryHandler);

// Complaints. Anyone can file. The inbox + decide are enforced in the service
// (actors are heterogeneous — team managers, Operations, Admins — so a coarse
// minOrgRole gate does not fit; capsFor()/the workflow do the real checks).
router.post('/', validate({ body: createComplaintSchema }), c.createComplaintHandler);
router.get('/', validate({ query: requestScopeQuerySchema }), c.listComplaintsHandler);
router.get('/export', validate({ query: requestScopeQuerySchema }), c.exportComplaintsHandler);
router.get('/:id', validate({ params: idParamSchema }), c.getComplaintHandler);
router.patch('/:id/decide', validate({ params: idParamSchema, body: requestDecisionSchema }), c.decideComplaintHandler);

export default router;
