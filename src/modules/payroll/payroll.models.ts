import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PAYROLL_RUN_STATUSES } from '@ems/types';

// ---- Payroll settings (active singleton): currency + fiscal year (no tax slabs) ----
const payrollSettingsSchema = new Schema(
  {
    key: { type: String, default: 'active', unique: true },
    jurisdiction: { type: String, default: 'Pakistan' },
    currency: { type: String, default: 'PKR' },
    fiscalYearStartMonth: { type: Number, default: 7 },
    taxYearLabel: { type: String, default: '2026' },
  },
  { timestamps: true },
);
export type PayrollSettingsDoc = HydratedDocument<InferSchemaType<typeof payrollSettingsSchema>>;
export const PayrollSettings = model('PayrollSettings', payrollSettingsSchema);

// ---- Salary structure (one per employee): owner-entered annual salary + tax ----
const salaryStructureSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currency: { type: String, default: 'PKR' },
    effectiveFrom: { type: Date },
    annualSalary: { type: Number, required: true, default: 0 },
    annualTax: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);
export type SalaryStructureDoc = HydratedDocument<InferSchemaType<typeof salaryStructureSchema>>;
export const SalaryStructure = model('SalaryStructure', salaryStructureSchema);

// ---- Payroll run ----
const payrollRunSchema = new Schema(
  {
    month: { type: String, required: true, unique: true }, // YYYY-MM
    status: { type: String, enum: PAYROLL_RUN_STATUSES, default: 'Draft' },
    processedById: { type: Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
    payslipCount: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export type PayrollRunDoc = HydratedDocument<InferSchemaType<typeof payrollRunSchema>>;
export const PayrollRun = model('PayrollRun', payrollRunSchema);

// ---- Payslip ----
const payslipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    month: { type: String, required: true },
    currency: { type: String, default: 'PKR' },
    grossMonthly: { type: Number, default: 0 },
    taxMonthly: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    ytdGross: { type: Number, default: 0 },
    ytdTax: { type: Number, default: 0 },
    ytdNet: { type: Number, default: 0 },
    taxYearLabel: { type: String },
    status: { type: String, enum: PAYROLL_RUN_STATUSES, default: 'Draft' },
  },
  { timestamps: true },
);
payslipSchema.index({ userId: 1, month: 1 }, { unique: true });
export type PayslipDoc = HydratedDocument<InferSchemaType<typeof payslipSchema>>;
export const Payslip = model('Payslip', payslipSchema);
