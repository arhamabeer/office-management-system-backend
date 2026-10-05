import { Types } from 'mongoose';
import { isAtLeast } from '@ems/types';
import type {
  GoalCategoryDTO,
  PerformancePolicyDTO,
  ReviewCycleDTO,
  GoalDTO,
  ReviewDTO,
  GoalStatus,
  ReviewStatus,
  ReviewCycleStatus,
} from '@ems/types';
import type {
  CreateGoalCategoryInput,
  UpdateGoalCategoryInput,
  UpdatePerformancePolicyInput,
  CreateReviewCycleInput,
  UpdateReviewCycleInput,
  CreateGoalInput,
  UpdateGoalInput,
  GoalDecisionInput,
  GoalsQuery,
  UpsertReviewInput,
  ReviewsQuery,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { GoalCategory, type GoalCategoryDoc } from './goalCategory.model';
import { PerformancePolicy, type PerformancePolicyDoc } from './performancePolicy.model';
import { ReviewCycle, type ReviewCycleDoc } from './reviewCycle.model';
import { Goal, type GoalDoc } from './goal.model';
import { Review, type ReviewDoc } from './review.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { scopedUserIds } from '../../common/scope';
import { recordAudit } from '../../middleware/audit';
import { notify } from '../../common/notify';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';

/** Seeded default rating scale — the policy carries this as editable data. */
const DEFAULT_RATING_LEVELS = [
  { value: 1, label: 'Needs improvement' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Meets expectations' },
  { value: 4, label: 'Exceeds expectations' },
  { value: 5, label: 'Outstanding' },
];

function isOrgAdmin(a: AuthUser): boolean {
  return a.accountType === 'Owner' || a.orgRole === 'Admin';
}

// ---------------------------------------------------------------- mappers

function categoryDTO(c: GoalCategoryDoc): GoalCategoryDTO {
  return { id: String(c._id), name: c.name, code: c.code, active: c.active ?? true };
}

function policyDTO(p: PerformancePolicyDoc): PerformancePolicyDTO {
  const levels = p.ratingLevels?.length ? p.ratingLevels : DEFAULT_RATING_LEVELS;
  return {
    ratingLevels: levels.map((l) => ({ value: l.value, label: l.label })),
    selfReviewEnabled: p.selfReviewEnabled ?? false,
  };
}

function cycleDTO(c: ReviewCycleDoc): ReviewCycleDTO {
  return {
    id: String(c._id),
    name: c.name,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status as ReviewCycleStatus,
    createdAt: (c.createdAt as Date).toISOString(),
  };
}

function goalDTO(
  g: GoalDoc,
  opts: { employeeName?: string; categoryName?: string; cycleName?: string; decidedByName?: string } = {},
): GoalDTO {
  return {
    id: String(g._id),
    userId: String(g.userId),
    employeeName: opts.employeeName,
    cycleId: g.cycleId ? String(g.cycleId) : undefined,
    cycleName: opts.cycleName,
    categoryId: g.categoryId ? String(g.categoryId) : undefined,
    categoryName: opts.categoryName,
    title: g.title,
    description: g.description ?? undefined,
    weight: g.weight ?? undefined,
    progress: g.progress ?? 0,
    status: g.status as GoalStatus,
    dueDate: g.dueDate ?? undefined,
    decidedById: g.decidedById ? String(g.decidedById) : undefined,
    decidedByName: opts.decidedByName,
    decidedAt: g.decidedAt ? g.decidedAt.toISOString() : undefined,
    decisionNote: g.decisionNote ?? undefined,
    createdAt: (g.createdAt as Date).toISOString(),
    updatedAt: (g.updatedAt as Date).toISOString(),
  };
}

function reviewDTO(
  r: ReviewDoc,
  opts: { employeeName?: string; reviewerName?: string; cycleName?: string; ratingLabel?: string } = {},
): ReviewDTO {
  return {
    id: String(r._id),
    userId: String(r.userId),
    employeeName: opts.employeeName,
    cycleId: String(r.cycleId),
    cycleName: opts.cycleName,
    reviewerId: String(r.reviewerId),
    reviewerName: opts.reviewerName,
    rating: r.rating ?? undefined,
    ratingLabel: opts.ratingLabel,
    comments: r.comments ?? undefined,
    strengths: r.strengths ?? undefined,
    improvements: r.improvements ?? undefined,
    status: r.status as ReviewStatus,
    sharedAt: r.sharedAt ? r.sharedAt.toISOString() : undefined,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------- lookups

async function nameMap(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const profs = await EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName');
  return new Map(profs.map((p) => [String(p.userId), `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()]));
}
async function categoryNames(): Promise<Map<string, string>> {
  const cats = await GoalCategory.find().select('name');
  return new Map(cats.map((c) => [String(c._id), c.name]));
}
async function cycleNames(): Promise<Map<string, string>> {
  const cs = await ReviewCycle.find().select('name');
  return new Map(cs.map((c) => [String(c._id), c.name]));
}
async function displayName(userId: string): Promise<string | undefined> {
  const p = await EmployeeProfile.findOne({ userId }).select('firstName lastName');
  if (!p) return undefined;
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || undefined;
}

// ---------------------------------------------------------------- config: policy

export async function getPolicyDoc(): Promise<PerformancePolicyDoc> {
  const existing = await PerformancePolicy.findOne({ key: 'default' });
  if (existing) return existing;
  try {
    await PerformancePolicy.create({ key: 'default', ratingLevels: DEFAULT_RATING_LEVELS });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await PerformancePolicy.findOne({ key: 'default' }))!;
}
export async function getPolicy(): Promise<PerformancePolicyDTO> {
  return policyDTO(await getPolicyDoc());
}
export async function updatePolicy(actor: AuthUser, input: UpdatePerformancePolicyInput): Promise<PerformancePolicyDTO> {
  const p = await getPolicyDoc();
  if (input.ratingLevels) p.set('ratingLevels', input.ratingLevels);
  if (input.selfReviewEnabled !== undefined) p.selfReviewEnabled = input.selfReviewEnabled;
  await p.save();
  await recordAudit({ action: 'performance.policy_updated', actorId: actor.id, actorLabel: actor.email });
  return policyDTO(p);
}

// ---------------------------------------------------------------- config: goal categories

export async function listCategories(includeInactive = false): Promise<GoalCategoryDTO[]> {
  const filter = includeInactive ? {} : { active: true };
  return (await GoalCategory.find(filter).sort({ name: 1 })).map(categoryDTO);
}
export async function createCategory(actor: AuthUser, input: CreateGoalCategoryInput): Promise<GoalCategoryDTO> {
  if (await GoalCategory.exists({ code: input.code.toUpperCase() })) {
    throw new ConflictError('A goal category with this code already exists');
  }
  const c = await GoalCategory.create({ ...input });
  await recordAudit({ action: 'performance.category_created', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}
export async function updateCategory(actor: AuthUser, id: string, input: UpdateGoalCategoryInput): Promise<GoalCategoryDTO> {
  const c = await GoalCategory.findById(id);
  if (!c) throw new NotFoundError('Goal category not found');
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'performance.category_updated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}
export async function deactivateCategory(actor: AuthUser, id: string): Promise<void> {
  const c = await GoalCategory.findById(id);
  if (!c) throw new NotFoundError('Goal category not found');
  c.active = false;
  await c.save();
  await recordAudit({ action: 'performance.category_deactivated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
}

// ---------------------------------------------------------------- cycles (admin)

export async function listCycles(): Promise<ReviewCycleDTO[]> {
  return (await ReviewCycle.find().sort({ startDate: -1 })).map(cycleDTO);
}
export async function createCycle(actor: AuthUser, input: CreateReviewCycleInput): Promise<ReviewCycleDTO> {
  const c = await ReviewCycle.create({ ...input, status: 'Open' });
  await recordAudit({ action: 'performance.cycle_created', actorId: actor.id, actorLabel: actor.email, meta: { name: c.name } });
  return cycleDTO(c);
}
export async function updateCycle(actor: AuthUser, id: string, input: UpdateReviewCycleInput): Promise<ReviewCycleDTO> {
  const c = await ReviewCycle.findById(id);
  if (!c) throw new NotFoundError('Review cycle not found');
  if (input.name !== undefined) c.name = input.name;
  if (input.status !== undefined) c.status = input.status;
  await c.save();
  await recordAudit({ action: 'performance.cycle_updated', actorId: actor.id, actorLabel: actor.email, meta: { name: c.name, status: c.status } });
  return cycleDTO(c);
}

// ---------------------------------------------------------------- goals

async function hydrateGoals(docs: GoalDoc[]): Promise<GoalDTO[]> {
  const [names, cats, cycles] = await Promise.all([
    nameMap([...docs.map((d) => d.userId), ...docs.filter((d) => d.decidedById).map((d) => d.decidedById as Types.ObjectId)]),
    categoryNames(),
    cycleNames(),
  ]);
  return docs.map((d) =>
    goalDTO(d, {
      employeeName: names.get(String(d.userId)),
      categoryName: d.categoryId ? cats.get(String(d.categoryId)) : undefined,
      cycleName: d.cycleId ? cycles.get(String(d.cycleId)) : undefined,
      decidedByName: d.decidedById ? names.get(String(d.decidedById)) : undefined,
    }),
  );
}

export async function listGoals(actor: AuthUser, query: GoalsQuery): Promise<GoalDTO[]> {
  const filter: Record<string, unknown> = {};
  if (query.cycleId) filter.cycleId = new Types.ObjectId(query.cycleId);
  if (query.scope === 'mine') {
    filter.userId = actor.id;
  } else if (query.scope === 'team') {
    const { orgWide, ids } = await scopedUserIds(actor);
    if (!orgWide) filter.userId = { $in: ids };
  } else {
    // 'all' — admin-wide; non-admins fall back to their team scope.
    if (!isOrgAdmin(actor)) {
      const { orgWide, ids } = await scopedUserIds(actor);
      if (!orgWide) filter.userId = { $in: ids };
    }
  }
  const docs = await Goal.find(filter).sort({ createdAt: -1 });
  return hydrateGoals(docs);
}

export async function createGoal(actor: AuthUser, input: CreateGoalInput): Promise<GoalDTO> {
  if (input.categoryId) {
    const cat = await GoalCategory.findById(input.categoryId);
    if (!cat || !cat.active) throw new NotFoundError('Goal category not found');
  }
  const g = await Goal.create({
    userId: new Types.ObjectId(actor.id),
    title: input.title,
    description: input.description,
    categoryId: input.categoryId ? new Types.ObjectId(input.categoryId) : undefined,
    cycleId: input.cycleId ? new Types.ObjectId(input.cycleId) : undefined,
    weight: input.weight,
    dueDate: input.dueDate,
    status: 'Draft',
    progress: 0,
  });
  await recordAudit({ action: 'goal.created', actorId: actor.id, actorLabel: actor.email, targetType: 'Goal', targetId: String(g._id) });
  return (await hydrateGoals([g]))[0]!;
}

async function ownedGoal(actor: AuthUser, id: string): Promise<GoalDoc> {
  const g = await Goal.findById(id);
  if (!g) throw new NotFoundError('Goal not found');
  if (String(g.userId) !== actor.id) throw new ForbiddenError('You can only change your own goals');
  return g;
}

export async function updateGoal(actor: AuthUser, id: string, input: UpdateGoalInput): Promise<GoalDTO> {
  const g = await ownedGoal(actor, id);
  const status = g.status as GoalStatus;
  if (status === 'Active') {
    if (input.progress != null) g.progress = input.progress;
  } else if (status === 'Draft' || status === 'Rejected') {
    if (input.title !== undefined) g.title = input.title;
    if (input.description !== undefined) g.description = input.description;
    if (input.categoryId !== undefined) g.categoryId = new Types.ObjectId(input.categoryId);
    if (input.cycleId !== undefined) g.cycleId = new Types.ObjectId(input.cycleId);
    if (input.weight !== undefined) g.weight = input.weight;
    if (input.dueDate !== undefined) g.dueDate = input.dueDate;
    if (input.progress != null) g.progress = input.progress;
  } else {
    throw new ConflictError('This goal can no longer be edited');
  }
  await g.save();
  return (await hydrateGoals([g]))[0]!;
}

export async function submitGoal(actor: AuthUser, id: string): Promise<GoalDTO> {
  const g = await ownedGoal(actor, id);
  const status = g.status as GoalStatus;
  if (status !== 'Draft' && status !== 'Rejected') throw new ConflictError('Only a draft goal can be submitted');
  g.status = 'PendingApproval';
  g.decidedById = undefined;
  g.decidedAt = undefined;
  g.decisionNote = undefined;
  await g.save();
  await recordAudit({ action: 'goal.submitted', actorId: actor.id, actorLabel: actor.email, targetType: 'Goal', targetId: String(g._id) });
  const prof = await EmployeeProfile.findOne({ userId: actor.id }).select('reportsToId firstName lastName');
  if (prof?.reportsToId) {
    const who = `${prof.firstName ?? ''} ${prof.lastName ?? ''}`.trim() || 'An employee';
    await notify({
      userId: String(prof.reportsToId),
      type: 'goal.pending',
      title: 'Goal to review',
      body: `${who} submitted a goal "${g.title}" for your approval.`,
      link: '/performance',
      email: true,
    });
  }
  return (await hydrateGoals([g]))[0]!;
}

export async function completeGoal(actor: AuthUser, id: string): Promise<GoalDTO> {
  const g = await ownedGoal(actor, id);
  if ((g.status as GoalStatus) !== 'Active') throw new ConflictError('Only an active goal can be completed');
  g.status = 'Completed';
  g.progress = 100;
  await g.save();
  await recordAudit({ action: 'goal.completed', actorId: actor.id, actorLabel: actor.email, targetType: 'Goal', targetId: String(g._id) });
  return (await hydrateGoals([g]))[0]!;
}

export async function decideGoal(actor: AuthUser, id: string, approve: boolean, input: GoalDecisionInput = {}): Promise<GoalDTO> {
  const g = await Goal.findById(id);
  if (!g) throw new NotFoundError('Goal not found');
  if ((g.status as GoalStatus) !== 'PendingApproval') throw new ConflictError('This goal is not awaiting approval');

  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === String(g.userId));
  if (!inScope) throw new ForbiddenError('That goal is outside your team');
  if (String(g.userId) === actor.id && !orgWide) throw new ForbiddenError('You cannot approve your own goal');

  g.status = approve ? 'Active' : 'Rejected';
  g.decidedById = new Types.ObjectId(actor.id);
  g.decidedAt = new Date();
  if (input.note) g.decisionNote = input.note;
  await g.save();
  await recordAudit({
    action: approve ? 'goal.approved' : 'goal.rejected',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Goal',
    targetId: String(g._id),
    meta: { employee: String(g.userId) },
  });
  await notify({
    userId: String(g.userId),
    type: 'goal.decided',
    title: `Goal ${approve ? 'approved' : 'sent back'}`,
    body: `Your goal "${g.title}" was ${approve ? 'approved' : 'sent back'}${input.note ? `: ${input.note}` : ''}.`,
    link: '/performance',
    email: true,
  });
  return (await hydrateGoals([g]))[0]!;
}

// ---------------------------------------------------------------- reviews

async function hydrateReviews(docs: ReviewDoc[]): Promise<ReviewDTO[]> {
  const [names, cycles, policy] = await Promise.all([
    nameMap([...docs.map((d) => d.userId), ...docs.map((d) => d.reviewerId)]),
    cycleNames(),
    getPolicyDoc(),
  ]);
  const labelOf = (v?: number | null): string | undefined =>
    v == null ? undefined : (policy.ratingLevels?.find((l) => l.value === v)?.label ?? String(v));
  return docs.map((d) =>
    reviewDTO(d, {
      employeeName: names.get(String(d.userId)),
      reviewerName: names.get(String(d.reviewerId)),
      cycleName: cycles.get(String(d.cycleId)),
      ratingLabel: labelOf(d.rating),
    }),
  );
}

export async function listReviews(actor: AuthUser, query: ReviewsQuery): Promise<ReviewDTO[]> {
  const filter: Record<string, unknown> = {};
  if (query.cycleId) filter.cycleId = new Types.ObjectId(query.cycleId);
  if (query.scope === 'mine') {
    // Reviews ABOUT me that have been shared.
    filter.userId = actor.id;
    filter.status = 'Shared';
  } else {
    // 'team' — reviews I can act on (my scope). Non-admins limited to their team.
    if (!isOrgAdmin(actor)) {
      const { orgWide, ids } = await scopedUserIds(actor);
      if (!orgWide) filter.userId = { $in: ids };
    }
  }
  const docs = await Review.find(filter).sort({ updatedAt: -1 });
  return hydrateReviews(docs);
}

export async function upsertReview(actor: AuthUser, input: UpsertReviewInput): Promise<ReviewDTO> {
  // Manager writes a review for an employee in their scope (never themselves).
  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === input.userId);
  if (!inScope) throw new ForbiddenError('That employee is outside your team');
  if (input.userId === actor.id && !orgWide) throw new ForbiddenError('You cannot review yourself');

  const cycle = await ReviewCycle.findById(input.cycleId);
  if (!cycle) throw new NotFoundError('Review cycle not found');

  let r = await Review.findOne({ userId: new Types.ObjectId(input.userId), cycleId: new Types.ObjectId(input.cycleId) });
  if (r && r.status === 'Shared') throw new ConflictError('This review has been shared and can no longer be edited');
  if (!r) {
    r = await Review.create({
      userId: new Types.ObjectId(input.userId),
      cycleId: new Types.ObjectId(input.cycleId),
      reviewerId: new Types.ObjectId(actor.id),
      rating: input.rating,
      comments: input.comments,
      strengths: input.strengths,
      improvements: input.improvements,
      status: 'Draft',
    });
  } else {
    r.reviewerId = new Types.ObjectId(actor.id);
    if (input.rating !== undefined) r.rating = input.rating;
    if (input.comments !== undefined) r.comments = input.comments;
    if (input.strengths !== undefined) r.strengths = input.strengths;
    if (input.improvements !== undefined) r.improvements = input.improvements;
    await r.save();
  }
  await recordAudit({ action: 'review.saved', actorId: actor.id, actorLabel: actor.email, targetType: 'Review', targetId: String(r._id), meta: { employee: input.userId } });
  return (await hydrateReviews([r]))[0]!;
}

export async function shareReview(actor: AuthUser, id: string): Promise<ReviewDTO> {
  const r = await Review.findById(id);
  if (!r) throw new NotFoundError('Review not found');
  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === String(r.userId));
  if (!inScope) throw new ForbiddenError('That review is outside your team');
  if (r.status === 'Shared') throw new ConflictError('This review is already shared');
  r.status = 'Shared';
  r.sharedAt = new Date();
  await r.save();
  await recordAudit({ action: 'review.shared', actorId: actor.id, actorLabel: actor.email, targetType: 'Review', targetId: String(r._id), meta: { employee: String(r.userId) } });
  await notify({
    userId: String(r.userId),
    type: 'review.shared',
    title: 'Your performance review is ready',
    body: 'Your manager has shared your performance review.',
    link: '/performance',
    email: true,
  });
  return (await hydrateReviews([r]))[0]!;
}
