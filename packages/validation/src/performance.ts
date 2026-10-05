import { z } from 'zod';
import { objectIdSchema } from './common';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');

// ---- goal categories (config) ----

export const createGoalCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(20),
});
export type CreateGoalCategoryInput = z.infer<typeof createGoalCategorySchema>;

export const updateGoalCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});
export type UpdateGoalCategoryInput = z.infer<typeof updateGoalCategorySchema>;

// ---- performance policy (config: rating scale) ----

export const ratingLevelSchema = z.object({
  value: z.number().int().min(0).max(100),
  label: z.string().trim().min(1).max(40),
});
export const updatePerformancePolicySchema = z.object({
  ratingLevels: z.array(ratingLevelSchema).min(2).max(10).optional(),
  selfReviewEnabled: z.boolean().optional(),
});
export type UpdatePerformancePolicyInput = z.infer<typeof updatePerformancePolicySchema>;

// ---- review cycles (admin) ----

export const createReviewCycleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  startDate: dateSchema,
  endDate: dateSchema,
});
export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;

export const updateReviewCycleSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  status: z.enum(['Open', 'Closed']).optional(),
});
export type UpdateReviewCycleInput = z.infer<typeof updateReviewCycleSchema>;

// ---- goals ----

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2000).optional(),
  categoryId: objectIdSchema.optional(),
  cycleId: objectIdSchema.optional(),
  weight: z.number().int().min(0).max(100).optional(),
  dueDate: dateSchema.optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: objectIdSchema.optional(),
  cycleId: objectIdSchema.optional(),
  weight: z.number().int().min(0).max(100).optional(),
  dueDate: dateSchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const goalDecisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type GoalDecisionInput = z.infer<typeof goalDecisionSchema>;

export const goalsQuerySchema = z.object({
  scope: z.enum(['mine', 'team', 'all']).default('mine'),
  cycleId: objectIdSchema.optional(),
});
export type GoalsQuery = z.infer<typeof goalsQuerySchema>;

// ---- reviews ----

/** Create-or-update a manager review for (userId, cycleId). */
export const upsertReviewSchema = z.object({
  userId: objectIdSchema,
  cycleId: objectIdSchema,
  rating: z.number().int().min(0).max(100).optional(),
  comments: z.string().trim().max(4000).optional(),
  strengths: z.string().trim().max(2000).optional(),
  improvements: z.string().trim().max(2000).optional(),
});
export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;

export const reviewsQuerySchema = z.object({
  scope: z.enum(['mine', 'team']).default('mine'),
  cycleId: objectIdSchema.optional(),
});
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;
