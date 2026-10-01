import type { PayrollRunStatus } from './enums';

/** Salary structure = two owner-entered annual figures. Monthly values are
 *  derived (annual ÷ 12); the app does NOT calculate tax. */
export interface SalaryStructureDTO {
  userId: string;
  currency: string;
  effectiveFrom?: string;
  annualSalary: number;
  annualTax: number;
  monthlySalary: number;
  monthlyTax: number;
  monthlyNet: number;
  annualNet: number;
}

/** One row of the all-employees salary table (Admin view). Money fields are
 *  null (not 0) when the employee has no salary structure yet. */
export interface EmployeeSalaryRowDTO {
  userId: string;
  fullName: string;
  email: string;
  designation?: string;
  status: string;
  currency: string;
  hasStructure: boolean;
  annualSalary: number | null;
  annualTax: number | null;
  monthlySalary: number | null;
  monthlyTax: number | null;
  monthlyNet: number | null;
  annualNet: number | null;
}

export interface PayrollSettingsDTO {
  jurisdiction: string;
  currency: string;
  fiscalYearStartMonth: number;
  taxYearLabel: string;
}

export interface PayslipDTO {
  id: string;
  userId: string;
  employeeName?: string;
  month: string;
  currency: string;
  grossMonthly: number;
  taxMonthly: number;
  netPay: number;
  ytdGross: number;
  ytdTax: number;
  ytdNet: number;
  taxYearLabel: string;
  status: PayrollRunStatus;
  createdAt: string;
}

export interface PayrollRunDTO {
  id: string;
  month: string;
  status: PayrollRunStatus;
  payslipCount: number;
  totalNet: number;
  totalTax: number;
  createdAt: string;
  finalizedAt?: string;
}

export interface TaxCertificateDTO {
  userId: string;
  employeeName: string;
  taxYearLabel: string;
  currency: string;
  annualGross: number;
  annualTax: number;
  annualNet: number;
  months: number;
}
