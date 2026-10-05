import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import type { GoalsQuery, ReviewsQuery } from '@ems/validation';
import * as service from './performance.service';

const goalScope = (v: unknown): GoalsQuery['scope'] => (v === 'team' || v === 'all' ? v : 'mine');
const reviewScope = (v: unknown): ReviewsQuery['scope'] => (v === 'team' ? 'team' : 'mine');
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

// --- policy (config) ---
export const getPolicyHandler = asyncHandler(async (_req, res) => sendOk(res, await service.getPolicy()));
export const updatePolicyHandler = asyncHandler(async (req, res) => sendOk(res, await service.updatePolicy(req.user!, req.body)));

// --- goal categories (config) ---
export const listCategoriesHandler = asyncHandler(async (_req, res) => sendOk(res, await service.listCategories()));
export const createCategoryHandler = asyncHandler(async (req, res) => sendOk(res, await service.createCategory(req.user!, req.body), 201));
export const updateCategoryHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateCategory(req.user!, req.params.id, req.body)));
export const deactivateCategoryHandler = asyncHandler(async (req, res) => {
  await service.deactivateCategory(req.user!, req.params.id);
  sendOk(res, { success: true });
});

// --- cycles ---
export const listCyclesHandler = asyncHandler(async (_req, res) => sendOk(res, await service.listCycles()));
export const createCycleHandler = asyncHandler(async (req, res) => sendOk(res, await service.createCycle(req.user!, req.body), 201));
export const updateCycleHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateCycle(req.user!, req.params.id, req.body)));

// --- goals ---
export const listGoalsHandler = asyncHandler(async (req, res) =>
  sendOk(res, await service.listGoals(req.user!, { scope: goalScope(req.query.scope), cycleId: str(req.query.cycleId) })),
);
export const createGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.createGoal(req.user!, req.body), 201));
export const updateGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateGoal(req.user!, req.params.id, req.body)));
export const submitGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.submitGoal(req.user!, req.params.id)));
export const completeGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.completeGoal(req.user!, req.params.id)));
export const approveGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.decideGoal(req.user!, req.params.id, true, req.body)));
export const rejectGoalHandler = asyncHandler(async (req, res) => sendOk(res, await service.decideGoal(req.user!, req.params.id, false, req.body)));

// --- reviews ---
export const listReviewsHandler = asyncHandler(async (req, res) =>
  sendOk(res, await service.listReviews(req.user!, { scope: reviewScope(req.query.scope), cycleId: str(req.query.cycleId) })),
);
export const upsertReviewHandler = asyncHandler(async (req, res) => sendOk(res, await service.upsertReview(req.user!, req.body), 201));
export const shareReviewHandler = asyncHandler(async (req, res) => sendOk(res, await service.shareReview(req.user!, req.params.id)));
