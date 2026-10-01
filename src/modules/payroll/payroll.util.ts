export interface SalaryView {
  monthlySalary: number;
  monthlyTax: number;
  monthlyNet: number;
  annualNet: number;
}

/** Derive monthly figures from the owner-entered annual salary + annual tax.
 *  The app does not calculate tax — annualTax is provided as-is. */
export function computeSalaryView(annualSalary: number, annualTax: number): SalaryView {
  const monthlySalary = Math.round(annualSalary / 12);
  const monthlyTax = Math.round(annualTax / 12);
  return {
    monthlySalary,
    monthlyTax,
    monthlyNet: monthlySalary - monthlyTax,
    annualNet: annualSalary - annualTax,
  };
}

/** Fiscal-year window for a YYYY-MM month, given the FY start month (1–12).
 *  The tax year is labelled by the calendar year in which the FY ends. */
export function fiscalYearBounds(
  month: string,
  fyStartMonth: number,
): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const startYear = m >= fyStartMonth ? y : y - 1;
  const start = `${startYear}-${String(fyStartMonth).padStart(2, '0')}`;
  const endMonthNum = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
  const endYear = fyStartMonth === 1 ? startYear : startYear + 1;
  const end = `${endYear}-${String(endMonthNum).padStart(2, '0')}`;
  return { start, end, label: String(endYear) };
}
