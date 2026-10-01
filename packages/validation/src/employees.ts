import { z } from 'zod';
import {
  emailSchema,
  objectIdSchema,
  accountTypeSchema,
  orgRoleSchema,
  paginationQuerySchema,
} from './common';

const EMPLOYMENT_TYPES = ['FullTime', 'PartTime', 'Contract', 'Intern', 'Probation'] as const;

export const createEmployeeSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  accountType: accountTypeSchema.default('Employee'),
  orgRole: orgRoleSchema.default('Member'),
  designation: z.string().trim().max(120).optional(),
  departmentId: objectIdSchema.optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FullTime'),
  joiningDate: z.coerce.date().optional(),
  reportsToId: objectIdSchema.optional(),
  leadId: objectIdSchema.optional(),
  phone: z.string().trim().max(40).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/** Update profile fields only. Role & email changes go through dedicated,
 *  audited endpoints (assignRole) — not this general update. */
export const updateEmployeeSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    designation: z.string().trim().max(120),
    departmentId: objectIdSchema,
    employmentType: z.enum(EMPLOYMENT_TYPES),
    joiningDate: z.coerce.date(),
    reportsToId: objectIdSchema,
    leadId: objectIdSchema,
    phone: z.string().trim().max(40),
  })
  .partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const assignRoleSchema = z
  .object({
    accountType: accountTypeSchema.optional(),
    orgRole: orgRoleSchema.optional(),
  })
  .refine((v) => v.accountType !== undefined || v.orgRole !== undefined, {
    message: 'Provide accountType and/or orgRole',
  });
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  departmentId: objectIdSchema.optional(),
  orgRole: orgRoleSchema.optional(),
  status: z.enum(['Invited', 'Active', 'Suspended', 'Deactivated']).optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const idParamSchema = z.object({ id: objectIdSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** Body for resending an invite. notify=false only regenerates the link (copy). */
export const resendInviteSchema = z.object({ notify: z.boolean().optional() });
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;

/** Bulk import employees from raw CSV text. */
export const importEmployeesSchema = z.object({ csv: z.string().min(1).max(1_000_000) });
export type ImportEmployeesInput = z.infer<typeof importEmployeesSchema>;
