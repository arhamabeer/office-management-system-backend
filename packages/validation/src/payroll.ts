import { z } from 'zod';
import { objectIdSchema } from './common';

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

/** Owner-entered annual salary + annual tax (no calculation). */
export const setSalaryStructureSchema = z
  .object({
    currency: z.string().trim().min(1).max(8).optional(),
    effectiveFrom: z.coerce.date().optional(),
    annualSalary: z.number().min(0),
    annualTax: z.number().min(0),
  })
  .refine((v) => v.annualTax <= v.annualSalary, {
    message: 'Annual tax cannot exceed annual salary',
    path: ['annualTax'],
  });
export type SetSalaryStructureInput = z.infer<typeof setSalaryStructureSchema>;

export const createPayrollRunSchema = z.object({ month: monthKey });
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const payslipQuerySchema = z.object({
  userId: objectIdSchema.optional(),
  year: z.coerce.number().int().min(1970).max(3000).optional(),
});
export type PayslipQuery = z.infer<typeof payslipQuerySchema>;

export const salaryQuerySchema = z.object({ userId: objectIdSchema.optional() });
export type SalaryQuery = z.infer<typeof salaryQuerySchema>;

export const userIdParamSchema = z.object({ userId: objectIdSchema });

/** Payroll settings (currency + fiscal year + label). No tax slabs. */
export const updatePayrollSettingsSchema = z
  .object({
    jurisdiction: z.string().trim().min(1).max(60),
    currency: z.string().trim().min(1).max(8),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    taxYearLabel: z.string().trim().max(20),
    autoRunEnabled: z.boolean(),
    payrollRunDay: z.number().int().min(1).max(28),
  })
  .partial();
export type UpdatePayrollSettingsInput = z.infer<typeof updatePayrollSettingsSchema>;

export const taxCertificateQuerySchema = z.object({
  userId: objectIdSchema.optional(),
  year: z.coerce.number().int().min(1970).max(3000).optional(),
});
export type TaxCertificateQuery = z.infer<typeof taxCertificateQuerySchema>;
