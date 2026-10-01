import { Types } from 'mongoose';
import type { ExpenseCategoryDTO, ExpensePolicyDTO, ExpenseClaimDTO, ExpenseClaimStatus } from '@ems/types';
import type {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  UpdateExpensePolicyInput,
  CreateExpenseClaimInput,
  ExpenseDecisionInput,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { ExpenseCategory, type ExpenseCategoryDoc } from './expenseCategory.model';
import { ExpensePolicy, type ExpensePolicyDoc } from './expensePolicy.model';
import { ExpenseClaim, type ExpenseClaimDoc } from './expenseClaim.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { effectiveLimit, exceedsLimit, canTransition } from './expenses.util';
import { scopedUserIds } from '../../common/scope';
import { recordAudit } from '../../middleware/audit';
import { notify } from '../../common/notify';
import { buildXlsx } from '../../common/xlsx';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';

// ---- mappers ----

function categoryDTO(c: ExpenseCategoryDoc): ExpenseCategoryDTO {
  return {
    id: String(c._id),
    name: c.name,
    code: c.code,
    perClaimLimit: c.perClaimLimit ?? 0,
    requiresApproval: c.requiresApproval ?? true,
    active: c.active ?? true,
  };
}

function policyDTO(p: ExpensePolicyDoc): ExpensePolicyDTO {
  return {
    currency: p.currency ?? 'PKR',
    requireApprovalByDefault: p.requireApprovalByDefault ?? true,
    defaultPerClaimLimit: p.defaultPerClaimLimit ?? 0,
    twoStepApproval: p.twoStepApproval ?? false,
  };
}

function claimDTO(c: ExpenseClaimDoc, categoryName?: string, employeeName?: string): ExpenseClaimDTO {
  return {
    id: String(c._id),
    userId: String(c.userId),
    employeeName,
    categoryId: String(c.categoryId),
    categoryName: categoryName ?? '',
    amount: c.amount,
    currency: c.currency ?? 'PKR',
    incurredOn: c.incurredOn,
    description: c.description,
    receiptRef: c.receiptRef ?? undefined,
    status: c.status as ExpenseClaimStatus,
    submittedAt: c.submittedAt ? c.submittedAt.toISOString() : undefined,
    decidedById: c.decidedById ? String(c.decidedById) : undefined,
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : undefined,
    decisionNote: c.decisionNote ?? undefined,
    reimbursedById: c.reimbursedById ? String(c.reimbursedById) : undefined,
    reimbursedAt: c.reimbursedAt ? c.reimbursedAt.toISOString() : undefined,
    createdAt: (c.createdAt as Date).toISOString(),
  };
}

// ---- config: policy ----

export async function getPolicyDoc(): Promise<ExpensePolicyDoc> {
  const existing = await ExpensePolicy.findOne({ key: 'default' });
  if (existing) return existing;
  try {
    await ExpensePolicy.create({ key: 'default' });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await ExpensePolicy.findOne({ key: 'default' }))!;
}

export async function getPolicy(): Promise<ExpensePolicyDTO> {
  return policyDTO(await getPolicyDoc());
}

export async function updatePolicy(actor: AuthUser, input: UpdateExpensePolicyInput): Promise<ExpensePolicyDTO> {
  const p = await getPolicyDoc();
  Object.assign(p, input);
  await p.save();
  await recordAudit({ action: 'expense.policy_updated', actorId: actor.id, actorLabel: actor.email });
  return policyDTO(p);
}

// ---- config: categories ----

export async function listCategories(includeInactive = false): Promise<ExpenseCategoryDTO[]> {
  const filter = includeInactive ? {} : { active: true };
  const cats = await ExpenseCategory.find(filter).sort({ name: 1 });
  return cats.map(categoryDTO);
}

export async function createCategory(actor: AuthUser, input: CreateExpenseCategoryInput): Promise<ExpenseCategoryDTO> {
  if (await ExpenseCategory.exists({ code: input.code.toUpperCase() })) {
    throw new ConflictError('An expense category with this code already exists');
  }
  const c = await ExpenseCategory.create({ ...input });
  await recordAudit({ action: 'expense.category_created', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function updateCategory(actor: AuthUser, id: string, input: UpdateExpenseCategoryInput): Promise<ExpenseCategoryDTO> {
  const c = await ExpenseCategory.findById(id);
  if (!c) throw new NotFoundError('Expense category not found');
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'expense.category_updated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function deactivateCategory(actor: AuthUser, id: string): Promise<void> {
  const c = await ExpenseCategory.findById(id);
  if (!c) throw new NotFoundError('Expense category not found');
  c.active = false;
  await c.save();
  await recordAudit({ action: 'expense.category_deactivated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
}

// ---- claims: helpers ----

async function categoryMap(): Promise<Map<string, string>> {
  const cats = await ExpenseCategory.find().select('name');
  return new Map(cats.map((c) => [String(c._id), c.name]));
}

async function nameMap(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const profs = await EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName');
  return new Map(profs.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]));
}

// ---- claims: create / list ----

/** Tell a submitter's manager (reportsToId) that a claim awaits review.
 *  Best-effort (notify swallows errors). Shared by the create-and-submit path
 *  and the draft-then-submit path so both always alert the approver. */
async function notifyExpenseApprover(submitterId: string, amount: number, currency: string): Promise<void> {
  const prof = await EmployeeProfile.findOne({ userId: submitterId }).select('reportsToId firstName lastName');
  if (!prof?.reportsToId) return;
  const who = `${prof.firstName ?? ''} ${prof.lastName ?? ''}`.trim() || 'An employee';
  await notify({
    userId: String(prof.reportsToId),
    type: 'approval.pending',
    title: 'Expense claim to review',
    body: `${who} submitted an expense claim of ${currency} ${amount}.`,
    link: '/approvals',
    email: true,
  });
}

export async function createClaim(userId: string, input: CreateExpenseClaimInput): Promise<ExpenseClaimDTO> {
  const category = await ExpenseCategory.findById(input.categoryId);
  if (!category || !category.active) throw new NotFoundError('Expense category not found');
  const policy = await getPolicyDoc();

  const limit = effectiveLimit(category.perClaimLimit ?? 0, policy.defaultPerClaimLimit ?? 0);
  if (exceedsLimit(input.amount, limit)) {
    throw new ValidationError(`Amount exceeds the ${limit} ${policy.currency} limit for ${category.name}`);
  }

  const saveDraft = input.submit === false;
  const needsApproval = category.requiresApproval ?? policy.requireApprovalByDefault ?? true;
  // Submitted -> waits for a decision; a category that doesn't require approval is
  // auto-approved on submit (config-driven). Draft is a private, unsubmitted claim.
  const status: ExpenseClaimStatus = saveDraft ? 'Draft' : needsApproval ? 'Submitted' : 'Approved';

  const claim = await ExpenseClaim.create({
    userId,
    categoryId: category._id,
    amount: input.amount,
    currency: policy.currency,
    incurredOn: input.incurredOn,
    description: input.description,
    receiptRef: input.receiptRef,
    status,
    submittedAt: saveDraft ? undefined : new Date(),
    decidedAt: status === 'Approved' ? new Date() : undefined,
  });
  await recordAudit({
    action: saveDraft ? 'expense.drafted' : 'expense.submitted',
    actorId: userId,
    targetType: 'ExpenseClaim',
    targetId: String(claim._id),
    meta: { category: category.code, amount: input.amount },
  });
  // The common path creates AND submits in one request — notify the approver here too.
  if (status === 'Submitted') await notifyExpenseApprover(userId, input.amount, policy.currency);
  return claimDTO(claim, category.name);
}

export async function submitClaim(actor: AuthUser, id: string): Promise<ExpenseClaimDTO> {
  const claim = await ExpenseClaim.findById(id);
  if (!claim) throw new NotFoundError('Expense claim not found');
  if (String(claim.userId) !== actor.id) throw new ForbiddenError('You can only submit your own claim');
  if (!canTransition(claim.status as ExpenseClaimStatus, 'Submitted')) {
    throw new ConflictError('Only a draft claim can be submitted');
  }
  claim.status = 'Submitted';
  claim.submittedAt = new Date();
  await claim.save();
  await recordAudit({ action: 'expense.submitted', actorId: actor.id, actorLabel: actor.email, targetType: 'ExpenseClaim', targetId: String(claim._id) });
  await notifyExpenseApprover(actor.id, claim.amount, claim.currency);
  const cats = await categoryMap();
  return claimDTO(claim, cats.get(String(claim.categoryId)));
}

export async function listClaims(
  actor: AuthUser,
  scope: 'mine' | 'pending' | 'team',
  year?: number,
): Promise<ExpenseClaimDTO[]> {
  const filter: Record<string, unknown> = {};
  if (scope === 'mine') {
    filter.userId = actor.id;
  } else {
    const { orgWide, ids } = await scopedUserIds(actor);
    if (!orgWide) filter.userId = { $in: ids };
    if (scope === 'pending') filter.status = 'Submitted';
  }
  if (year) filter.incurredOn = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };
  const docs = await ExpenseClaim.find(filter).sort({ createdAt: -1 });
  const [cats, names] = await Promise.all([categoryMap(), nameMap(docs.map((d) => d.userId))]);
  return docs.map((d) => claimDTO(d, cats.get(String(d.categoryId)), names.get(String(d.userId))));
}

export async function exportClaims(
  actor: AuthUser,
  scope: 'mine' | 'pending' | 'team',
  year?: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await listClaims(actor, scope, year);
  const buffer = await buildXlsx(
    'Expense claims',
    [
      { header: 'Employee', key: 'employeeName', width: 24 },
      { header: 'Category', key: 'categoryName', width: 16 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Incurred on', key: 'incurredOn', width: 13 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Description', key: 'description', width: 34 },
      { header: 'Decided on', key: 'decidedAt', width: 14 },
    ],
    rows.map((r) => ({
      employeeName: r.employeeName ?? '',
      categoryName: r.categoryName,
      amount: r.amount,
      currency: r.currency,
      incurredOn: r.incurredOn,
      status: r.status,
      description: r.description,
      decidedAt: r.decidedAt ? r.decidedAt.slice(0, 10) : '',
    })),
  );
  return { buffer, filename: `expense-claims-${scope}${year ? `-${year}` : ''}.xlsx` };
}

// ---- claims: decisions ----

export async function decideClaim(
  actor: AuthUser,
  id: string,
  approve: boolean,
  input: ExpenseDecisionInput = {},
): Promise<ExpenseClaimDTO> {
  const claim = await ExpenseClaim.findById(id);
  if (!claim) throw new NotFoundError('Expense claim not found');
  const target: ExpenseClaimStatus = approve ? 'Approved' : 'Rejected';
  if (!canTransition(claim.status as ExpenseClaimStatus, target)) {
    throw new ConflictError('This claim has already been decided');
  }

  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === String(claim.userId));
  if (!inScope) throw new ForbiddenError('This claim is outside your team');
  // scopedUserIds includes the actor's own id, so guard self-approval explicitly.
  if (String(claim.userId) === actor.id && !orgWide) throw new ForbiddenError('You cannot decide your own claim');

  claim.status = target;
  claim.decidedById = new Types.ObjectId(actor.id);
  claim.decidedAt = new Date();
  if (input.note) claim.decisionNote = input.note;
  await claim.save();
  await recordAudit({
    action: approve ? 'expense.approved' : 'expense.rejected',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'ExpenseClaim',
    targetId: String(claim._id),
    meta: { employee: String(claim.userId), amount: claim.amount },
  });
  await notify({
    userId: String(claim.userId),
    type: 'expense.decided',
    title: `Expense ${approve ? 'approved' : 'rejected'}`,
    body: `Your expense claim (${claim.currency} ${claim.amount}) was ${approve ? 'approved' : 'rejected'}${input.note ? `: ${input.note}` : ''}.`,
    link: '/expenses',
    email: true,
  });
  const cats = await categoryMap();
  return claimDTO(claim, cats.get(String(claim.categoryId)));
}

export async function reimburseClaim(actor: AuthUser, id: string): Promise<ExpenseClaimDTO> {
  const claim = await ExpenseClaim.findById(id);
  if (!claim) throw new NotFoundError('Expense claim not found');
  if (!canTransition(claim.status as ExpenseClaimStatus, 'Reimbursed')) {
    throw new ConflictError('Only an approved claim can be marked reimbursed');
  }
  claim.status = 'Reimbursed';
  claim.reimbursedById = new Types.ObjectId(actor.id);
  claim.reimbursedAt = new Date();
  await claim.save();
  await recordAudit({
    action: 'expense.reimbursed',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'ExpenseClaim',
    targetId: String(claim._id),
    meta: { employee: String(claim.userId), amount: claim.amount },
  });
  await notify({
    userId: String(claim.userId),
    type: 'expense.reimbursed',
    title: 'Expense reimbursed',
    body: `Your expense claim (${claim.currency} ${claim.amount}) has been marked reimbursed.`,
    link: '/expenses',
    email: true,
  });
  const cats = await categoryMap();
  return claimDTO(claim, cats.get(String(claim.categoryId)));
}
