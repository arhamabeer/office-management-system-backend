import { z } from 'zod';
import { objectIdSchema } from './common';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');

// ---- categories (config) ----

export const createInventoryCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(20),
});
export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;

export const updateInventoryCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});
export type UpdateInventoryCategoryInput = z.infer<typeof updateInventoryCategorySchema>;

// ---- inventory requests ----

export const createInventoryRequestSchema = z.object({
  categoryId: objectIdSchema,
  itemName: z.string().trim().min(1).max(120),
  quantity: z.number().int().positive().max(1_000_000),
  neededBy: dateSchema.optional(),
  reason: z.string().trim().min(1).max(2000),
  details: z.string().trim().max(4000).optional(),
});
export type CreateInventoryRequestInput = z.infer<typeof createInventoryRequestSchema>;
