import { z } from 'zod';
import { objectIdSchema } from './common';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(40).optional(),
  parentId: objectIdSchema.optional(),
  managerId: objectIdSchema.optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
