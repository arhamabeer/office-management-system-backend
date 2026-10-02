import { Router } from 'express';
import {
  createInventoryCategorySchema,
  updateInventoryCategorySchema,
  createInventoryRequestSchema,
  requestDecisionSchema,
  requestScopeQuerySchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './inventoryRequests.controller';

const router = Router();
router.use(requireAuth);

// Categories — anyone may list (to file); Admin/Owner to mutate.
router.get('/categories', c.listCategoriesHandler);
router.post('/categories', authorize({ minOrgRole: 'Admin' }), validate({ body: createInventoryCategorySchema }), c.createCategoryHandler);
router.patch('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateInventoryCategorySchema }), c.updateCategoryHandler);
router.delete('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deactivateCategoryHandler);

// Inventory requests. Anyone can file; inbox + decide are enforced in the
// service (team managers, Operations, Admins), so no coarse minOrgRole gate.
router.post('/', validate({ body: createInventoryRequestSchema }), c.createRequestHandler);
router.get('/', validate({ query: requestScopeQuerySchema }), c.listRequestsHandler);
router.get('/export', validate({ query: requestScopeQuerySchema }), c.exportRequestsHandler);
router.get('/:id', validate({ params: idParamSchema }), c.getRequestHandler);
router.patch('/:id/decide', validate({ params: idParamSchema, body: requestDecisionSchema }), c.decideRequestHandler);

export default router;
