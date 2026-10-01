import { z } from 'zod';
import { objectIdSchema } from './common';

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20).toUpperCase(),
  defaultQuota: z.number().int().min(0).max(366),
  paid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  color: z.string().trim().max(20).optional(),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const updateLeavePolicySchema = z
  .object({
    leaveYear: z.enum(['calendar', 'fiscal']),
    accrualMode: z.enum(['upfront', 'monthly']),
    carryForwardCap: z.number().int().min(0).max(366),
    encashment: z.boolean(),
    probationMonths: z.number().int().min(0).max(24),
    probationSickOnly: z.boolean(),
    twoStepApproval: z.boolean(),
  })
  .partial();
export type UpdateLeavePolicyInput = z.infer<typeof updateLeavePolicySchema>;

export const applyLeaveSchema = z
  .object({
    typeId: objectIdSchema,
    startDate: dayKey,
    endDate: dayKey,
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

export const leaveDecisionSchema = z.object({ comment: z.string().trim().max(500).optional() });
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;

export const leaveRequestsQuerySchema = z.object({
  scope: z.enum(['mine', 'pending', 'team']).default('mine'),
  year: z.coerce.number().int().min(1970).max(3000).optional(),
});
export type LeaveRequestsQuery = z.infer<typeof leaveRequestsQuerySchema>;

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(3000).optional(),
});
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>;

export const leaveCalendarQuerySchema = z.object({ month: monthKey.optional() });
export type LeaveCalendarQuery = z.infer<typeof leaveCalendarQuerySchema>;
