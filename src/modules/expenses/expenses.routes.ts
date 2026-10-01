import { Router } from 'express';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  updateExpensePolicySchema,
  createExpenseClaimSchema,
  expenseDecisionSchema,
  expenseClaimsQuerySchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './expenses.controller';

const router = Router();
router.use(requireAuth);

// Categories (Admin/Owner to mutate; anyone may list to file a claim)
router.get('/categories', c.listCategoriesHandler);
router.post('/categories', authorize({ minOrgRole: 'Admin' }), validate({ body: createExpenseCategorySchema }), c.createCategoryHandler);
router.patch('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema, body: updateExpenseCategorySchema }), c.updateCategoryHandler);
router.delete('/categories/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deactivateCategoryHandler);

// Policy
router.get('/policy', c.getPolicyHandler);
router.put('/policy', authorize({ minOrgRole: 'Admin' }), validate({ body: updateExpensePolicySchema }), c.updatePolicyHandler);

// Claims
router.post('/claims', validate({ body: createExpenseClaimSchema }), c.createClaimHandler);
router.get('/claims', validate({ query: expenseClaimsQuerySchema }), c.listClaimsHandler);
router.get('/claims/export', validate({ query: expenseClaimsQuerySchema }), c.exportClaimsHandler);
router.patch('/claims/:id/submit', validate({ params: idParamSchema }), c.submitClaimHandler);
// Decisions: real self/team scope is enforced in the service; the gate keeps
// Members off the endpoint entirely.
router.patch('/claims/:id/approve', authorize({ minOrgRole: 'Lead' }), validate({ params: idParamSchema, body: expenseDecisionSchema }), c.approveClaimHandler);
router.patch('/claims/:id/reject', authorize({ minOrgRole: 'Lead' }), validate({ params: idParamSchema, body: expenseDecisionSchema }), c.rejectClaimHandler);
// Reimbursement records money paid out — Owner/Admin only.
router.patch('/claims/:id/reimburse', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.reimburseClaimHandler);

export default router;
