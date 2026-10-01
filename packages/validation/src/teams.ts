import { z } from 'zod';
import { objectIdSchema } from './common';

const nameSchema = z.string().trim().min(1).max(80);
const descSchema = z.string().trim().max(500).optional();

export const createTeamSchema = z.object({
  name: nameSchema,
  description: descSchema,
  leadIds: z.array(objectIdSchema).max(50).optional(),
  memberIds: z.array(objectIdSchema).max(500).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    leadIds: z.array(objectIdSchema).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const teamMemberBodySchema = z.object({ userId: objectIdSchema });
export type TeamMemberBodyInput = z.infer<typeof teamMemberBodySchema>;

export const teamIdParamSchema = z.object({ id: objectIdSchema });
export const teamMemberParamSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
