import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(60).optional(),
  actorId: objectIdSchema.optional(),
  from: dayKey.optional(), // inclusive start date (YYYY-MM-DD)
  to: dayKey.optional(), // inclusive end date (YYYY-MM-DD)
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
