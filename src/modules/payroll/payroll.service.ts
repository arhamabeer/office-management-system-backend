import { Types } from 'mongoose';
import type {
  SalaryStructureDTO,
  EmployeeSalaryRowDTO,
  PayrollSettingsDTO,
  PayslipDTO,
  PayrollRunDTO,
  TaxCertificateDTO,
  PayrollRunStatus,
} from '@ems/types';
import type { SetSalaryStructureInput, UpdatePayrollSettingsInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import {
  PayrollSettings,
  SalaryStructure,
  PayrollRun,
  Payslip,
  type PayrollSettingsDoc,
  type PayslipDoc,
  type PayrollRunDoc,
  type SalaryStructureDoc,
} from './payroll.models';
import { User } from '../auth/user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { computeSalaryView, fiscalYearBounds } from './payroll.util';
import { generatePayslipPdf, generateCertificatePdf } from './pdf';
import { getCompanyProfile } from '../businessCard/businessCard.service';
import { buildXlsx } from '../../common/xlsx';
import { recordAudit } from '../../middleware/audit';
import { ForbiddenError, NotFoundError, ConflictError } from '../../common/errors';

function isOrgAdmin(a: AuthUser): boolean {
  return a.accountType === 'Owner' || a.orgRole === 'Admin';
}
function assertCanViewSalary(actor: AuthUser, targetUserId: string): void {
  if (actor.id !== targetUserId && !isOrgAdmin(actor)) {
    throw new ForbiddenError('You are not allowed to view this salary information');
  }
}

// ---- payroll settings ----

export async function getSettingsDoc(): Promise<PayrollSettingsDoc> {
  const existing = await PayrollSettings.findOne({ key: 'active' });
  if (existing) return existing;
  return PayrollSettings.create({
    key: 'active',
    jurisdiction: 'Pakistan',
    currency: 'PKR',
    fiscalYearStartMonth: 7,
    taxYearLabel: '2026',
  });
}

function settingsDTO(c: PayrollSettingsDoc): PayrollSettingsDTO {
  return {
    jurisdiction: c.jurisdiction ?? 'Pakistan',
    currency: c.currency ?? 'PKR',
    fiscalYearStartMonth: c.fiscalYearStartMonth ?? 7,
    taxYearLabel: c.taxYearLabel ?? '2026',
  };
}

export async function getSettings(): Promise<PayrollSettingsDTO> {
  return settingsDTO(await getSettingsDoc());
}

export async function updateSettings(actor: AuthUser, input: UpdatePayrollSettingsInput): Promise<PayrollSettingsDTO> {
  const c = await getSettingsDoc();
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'payroll.settings_updated', actorId: actor.id, actorLabel: actor.email });
  return settingsDTO(c);
}

// ---- salary structure ----

function structureDTO(doc: SalaryStructureDoc): SalaryStructureDTO {
  const annualSalary = doc.annualSalary ?? 0;
  const annualTax = doc.annualTax ?? 0;
  const v = computeSalaryView(annualSalary, annualTax);
  return {
    userId: String(doc.userId),
    currency: doc.currency ?? 'PKR',
    effectiveFrom: doc.effectiveFrom ? doc.effectiveFrom.toISOString() : undefined,
    annualSalary,
    annualTax,
    monthlySalary: v.monthlySalary,
    monthlyTax: v.monthlyTax,
    monthlyNet: v.monthlyNet,
    annualNet: v.annualNet,
  };
}

export async function getSalary(actor: AuthUser, targetUserId?: string): Promise<SalaryStructureDTO | null> {
  const target = targetUserId ?? actor.id;
  assertCanViewSalary(actor, target);
  const doc = await SalaryStructure.findOne({ userId: target });
  if (!doc) return null;
  await recordAudit({ action: 'salary.view', actorId: actor.id, actorLabel: actor.email, targetType: 'User', targetId: target });
  return structureDTO(doc);
}

/** Every employee (Active + Invited) with their salary structure, for the Admin
 *  salary table. Owner/Admin only. One salary read joined in memory (no N+1),
 *  one bulk audit record. Money fields are null when no structure exists. */
export async function listAllSalaries(actor: AuthUser): Promise<EmployeeSalaryRowDTO[]> {
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only Owner/Admin can view all salaries');
  const defaultCurrency = (await getSettingsDoc()).currency ?? 'PKR';
  const profiles = await EmployeeProfile.find({ status: { $in: ['Active', 'Invited'] } })
    .select('userId firstName lastName designation status')
    .sort({ firstName: 1, lastName: 1 });
  const userIds = profiles.map((p) => p.userId);
  const [users, structures] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('email status'),
    SalaryStructure.find({ userId: { $in: userIds } }),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const structMap = new Map(structures.map((s) => [String(s.userId), s]));

  const rows: EmployeeSalaryRowDTO[] = profiles.map((p) => {
    const uid = String(p.userId);
    const user = userMap.get(uid);
    const st = structMap.get(uid);
    const base = {
      userId: uid,
      fullName: `${p.firstName} ${p.lastName}`.trim(),
      email: user?.email ?? '',
      designation: p.designation ?? undefined,
      status: user?.status ?? p.status ?? 'Active',
    };
    if (st) {
      const v = computeSalaryView(st.annualSalary, st.annualTax);
      return {
        ...base,
        currency: st.currency ?? defaultCurrency,
        hasStructure: true,
        annualSalary: st.annualSalary,
        annualTax: st.annualTax,
        monthlySalary: v.monthlySalary,
        monthlyTax: v.monthlyTax,
        monthlyNet: v.monthlyNet,
        annualNet: v.annualNet,
      };
    }
    return {
      ...base,
      currency: defaultCurrency,
      hasStructure: false,
      annualSalary: null,
      annualTax: null,
      monthlySalary: null,
      monthlyTax: null,
      monthlyNet: null,
      annualNet: null,
    };
  });

  await recordAudit({ action: 'salary.list_all', actorId: actor.id, actorLabel: actor.email, meta: { count: rows.length } });
  return rows;
}

export async function exportSalaries(actor: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await listAllSalaries(actor);
  const buffer = await buildXlsx(
    'Salaries',
    [
      { header: 'Employee', key: 'fullName', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Annual salary', key: 'annualSalary', width: 14 },
      { header: 'Annual tax', key: 'annualTax', width: 12 },
      { header: 'Monthly salary', key: 'monthlySalary', width: 14 },
      { header: 'Monthly net', key: 'monthlyNet', width: 13 },
    ],
    rows.map((r) => ({
      fullName: r.fullName,
      email: r.email,
      designation: r.designation ?? '',
      status: r.status,
      currency: r.currency,
      annualSalary: r.annualSalary ?? '',
      annualTax: r.annualTax ?? '',
      monthlySalary: r.monthlySalary ?? '',
      monthlyNet: r.monthlyNet ?? '',
    })),
  );
  return { buffer, filename: 'salaries.xlsx' };
}

export async function setSalaryStructure(
  actor: AuthUser,
  targetUserId: string,
  input: SetSalaryStructureInput,
): Promise<SalaryStructureDTO> {
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only Owner/Admin can set salary structures');
  const user = await User.findById(targetUserId);
  if (!user) throw new NotFoundError('Employee not found');
  const doc =
    (await SalaryStructure.findOne({ userId: targetUserId })) ??
    new SalaryStructure({ userId: new Types.ObjectId(targetUserId) });
  doc.currency = input.currency ?? doc.currency ?? 'PKR';
  if (input.effectiveFrom) doc.effectiveFrom = input.effectiveFrom;
  doc.annualSalary = input.annualSalary;
  doc.annualTax = input.annualTax;
  await doc.save();
  await recordAudit({
    action: 'salary.structure_updated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: targetUserId,
    meta: { annualSalary: input.annualSalary, annualTax: input.annualTax },
  });
  return structureDTO(doc);
}

// ---- payroll runs ----

function payslipDTO(p: PayslipDoc, employeeName?: string): PayslipDTO {
  return {
    id: String(p._id),
    userId: String(p.userId),
    employeeName,
    month: p.month,
    currency: p.currency ?? 'PKR',
    grossMonthly: p.grossMonthly ?? 0,
    taxMonthly: p.taxMonthly ?? 0,
    netPay: p.netPay ?? 0,
    ytdGross: p.ytdGross ?? 0,
    ytdTax: p.ytdTax ?? 0,
    ytdNet: p.ytdNet ?? 0,
    taxYearLabel: p.taxYearLabel ?? '',
    status: (p.status ?? 'Draft') as PayrollRunStatus,
    createdAt: (p.createdAt as Date).toISOString(),
  };
}

function runDTO(r: PayrollRunDoc): PayrollRunDTO {
  return {
    id: String(r._id),
    month: r.month,
    status: (r.status ?? 'Draft') as PayrollRunStatus,
    payslipCount: r.payslipCount ?? 0,
    totalNet: r.totalNet ?? 0,
    totalTax: r.totalTax ?? 0,
    createdAt: (r.createdAt as Date).toISOString(),
    finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : undefined,
  };
}

export async function runPayroll(actor: AuthUser, month: string): Promise<PayrollRunDTO> {
  const existing = await PayrollRun.findOne({ month });
  if (existing && existing.status !== 'Draft') {
    throw new ConflictError(`Payroll for ${month} is already ${existing.status.toLowerCase()}`);
  }
  const settings = await getSettingsDoc();
  const { start, label } = fiscalYearBounds(month, settings.fiscalYearStartMonth ?? 7);

  const run =
    existing ??
    (await PayrollRun.create({ month, status: 'Draft', processedById: new Types.ObjectId(actor.id) }));

  const structures = await SalaryStructure.find();
  let totalNet = 0;
  let totalTax = 0;
  let count = 0;
  const processedIds: Types.ObjectId[] = [];

  for (const st of structures) {
    const user = await User.findById(st.userId).select('status');
    if (!user || user.status !== 'Active') continue;
    const v = computeSalaryView(st.annualSalary ?? 0, st.annualTax ?? 0);
    if (v.monthlySalary <= 0) continue;
    processedIds.push(st.userId);

    const prior = await Payslip.find({ userId: st.userId, month: { $gte: start, $lt: month } });
    const priorGross = prior.reduce((a, p) => a + (p.grossMonthly ?? 0), 0);
    const priorTax = prior.reduce((a, p) => a + (p.taxMonthly ?? 0), 0);
    const priorNet = prior.reduce((a, p) => a + (p.netPay ?? 0), 0);

    await Payslip.updateOne(
      { userId: st.userId, month },
      {
        $set: {
          userId: st.userId,
          runId: run._id,
          month,
          currency: st.currency ?? settings.currency ?? 'PKR',
          grossMonthly: v.monthlySalary,
          taxMonthly: v.monthlyTax,
          netPay: v.monthlyNet,
          ytdGross: priorGross + v.monthlySalary,
          ytdTax: priorTax + v.monthlyTax,
          ytdNet: priorNet + v.monthlyNet,
          taxYearLabel: label,
          status: 'Draft',
        },
      },
      { upsert: true },
    );
    totalNet += v.monthlyNet;
    totalTax += v.monthlyTax;
    count += 1;
  }

  // On a re-run, drop payslips from this month for users no longer processed
  // (deactivated or structure removed) so a finalize can't include phantoms.
  await Payslip.deleteMany({ month, userId: { $nin: processedIds } });

  run.payslipCount = count;
  run.totalNet = totalNet;
  run.totalTax = totalTax;
  run.status = 'Draft';
  await run.save();
  await recordAudit({ action: 'payroll.run', actorId: actor.id, actorLabel: actor.email, meta: { month, count } });
  return runDTO(run);
}

export async function finalizeRun(actor: AuthUser, id: string): Promise<PayrollRunDTO> {
  const run = await PayrollRun.findById(id);
  if (!run) throw new NotFoundError('Payroll run not found');
  if (run.status !== 'Draft') throw new ConflictError('Only a draft run can be finalized');
  run.status = 'Finalized';
  run.finalizedAt = new Date();
  await run.save();
  await Payslip.updateMany({ runId: run._id }, { $set: { status: 'Finalized' } });
  await recordAudit({ action: 'payroll.finalized', actorId: actor.id, actorLabel: actor.email, meta: { month: run.month } });
  return runDTO(run);
}

export async function listRuns(): Promise<PayrollRunDTO[]> {
  const runs = await PayrollRun.find().sort({ month: -1 });
  return runs.map(runDTO);
}

// ---- payslips ----

async function employeeName(userId: string): Promise<string | undefined> {
  const p = await EmployeeProfile.findOne({ userId }).select('firstName lastName');
  return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
}

export async function listPayslips(actor: AuthUser, targetUserId?: string, year?: number): Promise<PayslipDTO[]> {
  const target = targetUserId ?? actor.id;
  assertCanViewSalary(actor, target);
  const filter: Record<string, unknown> = { userId: target };
  if (year) filter.taxYearLabel = String(year);
  const docs = await Payslip.find(filter).sort({ month: -1 });
  await recordAudit({ action: 'salary.view', actorId: actor.id, actorLabel: actor.email, targetType: 'User', targetId: target, meta: { payslips: docs.length } });
  const name = await employeeName(target);
  return docs.map((d) => payslipDTO(d, name));
}

async function loadPayslipFor(actor: AuthUser, id: string): Promise<PayslipDoc> {
  const doc = await Payslip.findById(id);
  if (!doc) throw new NotFoundError('Payslip not found');
  assertCanViewSalary(actor, String(doc.userId));
  return doc;
}

export async function getPayslip(actor: AuthUser, id: string): Promise<PayslipDTO> {
  const doc = await loadPayslipFor(actor, id);
  await recordAudit({ action: 'salary.view', actorId: actor.id, actorLabel: actor.email, targetType: 'Payslip', targetId: id });
  return payslipDTO(doc, await employeeName(String(doc.userId)));
}

export async function getPayslipPdf(actor: AuthUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await loadPayslipFor(actor, id);
  const dto = payslipDTO(doc, await employeeName(String(doc.userId)));
  await recordAudit({ action: 'payslip.download', actorId: actor.id, actorLabel: actor.email, targetType: 'Payslip', targetId: id });
  return { buffer: await generatePayslipPdf(dto, await getCompanyProfile()), filename: `payslip-${dto.month}.pdf` };
}

// ---- tax certificate ----

async function buildCertificate(actor: AuthUser, targetUserId: string, year?: number): Promise<TaxCertificateDTO> {
  assertCanViewSalary(actor, targetUserId);
  const settings = await getSettingsDoc();
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = year ? String(year) : fiscalYearBounds(curMonth, settings.fiscalYearStartMonth ?? 7).label;
  const docs = await Payslip.find({ userId: targetUserId, taxYearLabel: label });
  const annualGross = docs.reduce((a, p) => a + (p.grossMonthly ?? 0), 0);
  const annualTax = docs.reduce((a, p) => a + (p.taxMonthly ?? 0), 0);
  const annualNet = docs.reduce((a, p) => a + (p.netPay ?? 0), 0);
  return {
    userId: targetUserId,
    employeeName: (await employeeName(targetUserId)) ?? targetUserId,
    taxYearLabel: label,
    currency: settings.currency ?? 'PKR',
    annualGross,
    annualTax,
    annualNet,
    months: docs.length,
  };
}

export async function getTaxCertificate(actor: AuthUser, targetUserId?: string, year?: number): Promise<TaxCertificateDTO> {
  const cert = await buildCertificate(actor, targetUserId ?? actor.id, year);
  await recordAudit({ action: 'taxcert.view', actorId: actor.id, actorLabel: actor.email, targetType: 'User', targetId: cert.userId, meta: { year: cert.taxYearLabel } });
  return cert;
}

export async function getTaxCertificatePdf(actor: AuthUser, targetUserId?: string, year?: number): Promise<{ buffer: Buffer; filename: string }> {
  const cert = await buildCertificate(actor, targetUserId ?? actor.id, year);
  await recordAudit({ action: 'taxcert.download', actorId: actor.id, actorLabel: actor.email, targetType: 'User', targetId: cert.userId, meta: { year: cert.taxYearLabel } });
  return { buffer: await generateCertificatePdf(cert, await getCompanyProfile()), filename: `tax-certificate-${cert.taxYearLabel}.pdf` };
}
