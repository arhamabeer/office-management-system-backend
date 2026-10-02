import { z } from 'zod';
import { objectIdSchema } from './common';

// ---- categories (config) ----

export const createComplaintCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(20),
});
export type CreateComplaintCategoryInput = z.infer<typeof createComplaintCategorySchema>;

export const updateComplaintCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});
export type UpdateComplaintCategoryInput = z.infer<typeof updateComplaintCategorySchema>;

// ---- complaints ----

export const createComplaintSchema = z.object({
  categoryId: objectIdSchema,
  subject: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(2000),
  details: z.string().trim().max(4000).optional(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
