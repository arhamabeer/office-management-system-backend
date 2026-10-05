import { Router } from 'express';
import {
  createGoalCategorySchema,
  updateGoalCategorySchema,
  updatePerformancePolicySchema,
  createReviewCycleSchema,
  updateReviewCycleSchema,
  createGoalSchema,
  updateGoalSchema,
  goalDecisionSchema,
  goalsQuerySchema,
  upsertReviewSchema,
  reviewsQuerySchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './performance.controller';

const router = Router();
router.use(requireAuth);

// Config: anyone may read (to pick categories/cycles); Admin/Owner to mutate.
router.get('/categories', c.listCategoriesHandler);
router.post('/categories', authorize({ minOrgRole: 'Admin' }), validate({ body: createGoalCategorySchema }), c.createCategoryHandler);
router.patch('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateGoalCategorySchema }), c.updateCategoryHandler);
router.delete('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deactivateCategoryHandler);

router.get('/policy', c.getPolicyHandler);
router.put('/policy', authorize({ minOrgRole: 'Admin' }), validate({ body: updatePerformancePolicySchema }), c.updatePolicyHandler);

router.get('/cycles', c.listCyclesHandler);
router.post('/cycles', authorize({ minOrgRole: 'Admin' }), validate({ body: createReviewCycleSchema }), c.createCycleHandler);
router.patch('/cycles/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateReviewCycleSchema }), c.updateCycleHandler);

// Goals — employees manage their own (ownership enforced in the service);
// approve/reject are gated to Lead+ (team scope enforced in the service).
router.get('/goals', validate({ query: goalsQuerySchema }), c.listGoalsHandler);
router.post('/goals', validate({ body: createGoalSchema }), c.createGoalHandler);
router.patch('/goals/:id', validate({ params: idParamSchema, body: updateGoalSchema }), c.updateGoalHandler);
router.patch('/goals/:id/submit', validate({ params: idParamSchema }), c.submitGoalHandler);
router.patch('/goals/:id/complete', validate({ params: idParamSchema }), c.completeGoalHandler);
router.patch('/goals/:id/approve', authorize({ minOrgRole: 'Lead' }), validate({ params: idParamSchema, body: goalDecisionSchema }), c.approveGoalHandler);
router.patch('/goals/:id/reject', authorize({ minOrgRole: 'Lead' }), validate({ params: idParamSchema, body: goalDecisionSchema }), c.rejectGoalHandler);

// Reviews — the shared list ('mine') is any auth; writing/sharing is Lead+.
router.get('/reviews', validate({ query: reviewsQuerySchema }), c.listReviewsHandler);
router.post('/reviews', authorize({ minOrgRole: 'Lead' }), validate({ body: upsertReviewSchema }), c.upsertReviewHandler);
router.patch('/reviews/:id/share', authorize({ minOrgRole: 'Lead' }), validate({ params: idParamSchema }), c.shareReviewHandler);

export default router;
