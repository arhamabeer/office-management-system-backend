import { Types } from 'mongoose';
import type {
  ComplaintCategoryDTO,
  ComplaintDTO,
  RequestStatus,
  RequestRouteTarget,
  RequestTimelineAction,
} from '@ems/types';
import type {
  CreateComplaintCategoryInput,
  UpdateComplaintCategoryInput,
  CreateComplaintInput,
  RequestDecisionInput,
  RequestScopeQuery,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { ComplaintCategory, type ComplaintCategoryDoc } from './complaintCategory.model';
import { Complaint, type ComplaintDoc } from './complaint.model';
import { recordAudit } from '../../middleware/audit';
import { notify, notifyMany } from '../../common/notify';
import { buildXlsx } from '../../common/xlsx';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import {
  applyRequestAction,
  capsFor,
  buildInboxFilter,
  handlerUserIds,
  actorRoleLabel,
  displayName,
  nameMap,
  notifyNewRequest,
  filedTimelineEntry,
  RequestWorkflowError,
} from '../../common/requestWorkflow';

// ---------------------------------------------------------------- mappers

function categoryDTO(c: ComplaintCategoryDoc): ComplaintCategoryDTO {
  return { id: String(c._id), name: c.name, code: c.code, active: c.active ?? true };
}

function complaintDTO(
  c: ComplaintDoc,
  categoryName?: string,
  employeeName?: string,
  decidedByName?: string,
): ComplaintDTO {
  return {
    id: String(c._id),
    userId: String(c.userId),
    employeeName,
    categoryId: String(c.categoryId),
    categoryName,
    subject: c.subject,
    reason: c.reason,
    details: c.details ?? undefined,
    status: c.status as RequestStatus,
    routedTo: (c.routedTo ?? []) as RequestRouteTarget[],
    resolution: c.resolution ?? undefined,
    decidedById: c.decidedById ? String(c.decidedById) : undefined,
    decidedByName,
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : undefined,
    timeline: (c.timeline ?? []).map((t) => ({
      at: (t.at as Date).toISOString(),
      byId: t.byId ? String(t.byId) : '',
      byName: t.byName ?? undefined,
      byRole: t.byRole ?? '',
      action: t.action as RequestTimelineAction,
      note: t.note ?? undefined,
      routedTo: t.routedTo && t.routedTo.length ? (t.routedTo as RequestRouteTarget[]) : undefined,
    })),
    createdAt: (c.createdAt as Date).toISOString(),
    updatedAt: (c.updatedAt as Date).toISOString(),
  };
}

async function categoryMap(): Promise<Map<string, string>> {
  const cats = await ComplaintCategory.find().select('name');
  return new Map(cats.map((c) => [String(c._id), c.name]));
}

// ---------------------------------------------------------------- config: categories

export async function listCategories(includeInactive = false): Promise<ComplaintCategoryDTO[]> {
  const filter = includeInactive ? {} : { active: true };
  const cats = await ComplaintCategory.find(filter).sort({ name: 1 });
  return cats.map(categoryDTO);
}

export async function createCategory(actor: AuthUser, input: CreateComplaintCategoryInput): Promise<ComplaintCategoryDTO> {
  if (await ComplaintCategory.exists({ code: input.code.toUpperCase() })) {
    throw new ConflictError('A complaint category with this code already exists');
  }
  const c = await ComplaintCategory.create({ ...input });
  await recordAudit({ action: 'complaint.category_created', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function updateCategory(actor: AuthUser, id: string, input: UpdateComplaintCategoryInput): Promise<ComplaintCategoryDTO> {
  const c = await ComplaintCategory.findById(id);
  if (!c) throw new NotFoundError('Complaint category not found');
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'complaint.category_updated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function deactivateCategory(actor: AuthUser, id: string): Promise<void> {
  const c = await ComplaintCategory.findById(id);
  if (!c) throw new NotFoundError('Complaint category not found');
  c.active = false;
  await c.save();
  await recordAudit({ action: 'complaint.category_deactivated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
}

// ---------------------------------------------------------------- file / list

export async function createComplaint(actor: AuthUser, input: CreateComplaintInput): Promise<ComplaintDTO> {
  const category = await ComplaintCategory.findById(input.categoryId);
  if (!category || !category.active) throw new NotFoundError('Complaint category not found');
  const name = await displayName(actor.id);
  const doc = await Complaint.create({
    userId: new Types.ObjectId(actor.id),
    categoryId: category._id,
    subject: input.subject,
    reason: input.reason,
    details: input.details,
    status: 'Submitted',
    routedTo: [],
    timeline: [filedTimelineEntry(actor, name)],
  });
  await recordAudit({ action: 'complaint.filed', actorId: actor.id, actorLabel: actor.email, targetType: 'Complaint', targetId: String(doc._id), meta: { category: category.code } });
  await notifyNewRequest(actor.id, 'Complaint to review', `${name ?? 'An employee'} filed a complaint: "${input.subject}".`);
  return complaintDTO(doc, category.name, name);
}

export async function listComplaints(actor: AuthUser, query: RequestScopeQuery): Promise<ComplaintDTO[]> {
  let filter: Record<string, unknown>;
  if (query.scope === 'mine') {
    filter = { userId: actor.id };
  } else if (query.scope === 'inbox') {
    filter = await buildInboxFilter(actor);
  } else {
    // 'all' is an admin-wide view; non-admins fall back to their inbox.
    const isAdmin = actor.accountType === 'Owner' || actor.orgRole === 'Admin';
    filter = isAdmin ? {} : await buildInboxFilter(actor);
  }
  const docs = await Complaint.find(filter).sort({ createdAt: -1 });
  const [cats, names] = await Promise.all([categoryMap(), nameMap(docs.map((d) => d.userId))]);
  return docs.map((d) => complaintDTO(d, cats.get(String(d.categoryId)), names.get(String(d.userId))));
}

export async function getComplaint(actor: AuthUser, id: string): Promise<ComplaintDTO> {
  const doc = await Complaint.findById(id);
  if (!doc) throw new NotFoundError('Complaint not found');
  const isOwnerOfRecord = String(doc.userId) === actor.id;
  const caps = await capsFor(actor, String(doc.userId));
  const canSee = isOwnerOfRecord || caps.canManage || caps.canActOps || caps.canActAdmin;
  if (!canSee) throw new ForbiddenError('You cannot view this complaint');
  const [cats, names] = await Promise.all([categoryMap(), nameMap([doc.userId])]);
  return complaintDTO(doc, cats.get(String(doc.categoryId)), names.get(String(doc.userId)));
}

// ---------------------------------------------------------------- decide (the 5-action workflow)

export async function decideComplaint(actor: AuthUser, id: string, input: RequestDecisionInput): Promise<ComplaintDTO> {
  const doc = await Complaint.findById(id);
  if (!doc) throw new NotFoundError('Complaint not found');

  const caps = await capsFor(actor, String(doc.userId));
  let result;
  try {
    result = applyRequestAction(
      { status: doc.status as RequestStatus, routedTo: (doc.routedTo ?? []) as RequestRouteTarget[] },
      input.action,
      caps,
    );
  } catch (err) {
    if (err instanceof RequestWorkflowError) {
      throw err.kind === 'forbidden' ? new ForbiddenError(err.message) : new ConflictError(err.message);
    }
    throw err;
  }

  const name = await displayName(actor.id);
  doc.status = result.status;
  doc.routedTo = result.routedTo;
  doc.timeline.push({
    at: new Date(),
    byId: new Types.ObjectId(actor.id),
    byName: name,
    byRole: actorRoleLabel(actor),
    action: input.action,
    note: input.note,
    routedTo: result.routedTo.length ? result.routedTo : undefined,
  });
  const closed = result.status === 'Resolved' || result.status === 'Rejected';
  if (closed) {
    doc.decidedById = new Types.ObjectId(actor.id);
    doc.decidedAt = new Date();
    if (input.note) doc.resolution = input.note;
  }
  await doc.save();

  await recordAudit({
    action: `complaint.${input.action}`,
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Complaint',
    targetId: String(doc._id),
    meta: { status: result.status, routedTo: result.routedTo },
  });

  if (result.status === 'Forwarded') {
    const recipients = await handlerUserIds(result.routedTo);
    await notifyMany(
      recipients,
      {
        type: 'complaint.forwarded',
        title: 'Complaint forwarded to you',
        body: `A complaint "${doc.subject}" was forwarded for your action${input.note ? `: ${input.note}` : ''}.`,
        link: '/approvals',
        email: true,
      },
      actor.id,
    );
  } else {
    await notify({
      userId: String(doc.userId),
      type: 'complaint.decided',
      title: `Complaint ${result.status.toLowerCase()}`,
      body: `Your complaint "${doc.subject}" was ${result.status.toLowerCase()}${input.note ? `: ${input.note}` : ''}.`,
      link: '/complaints',
      email: true,
    });
  }

  const cats = await categoryMap();
  return complaintDTO(doc, cats.get(String(doc.categoryId)), name);
}

// ---------------------------------------------------------------- export

export async function exportComplaints(actor: AuthUser, query: RequestScopeQuery): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await listComplaints(actor, query);
  const buffer = await buildXlsx(
    'Complaints',
    [
      { header: 'Employee', key: 'employeeName', width: 24 },
      { header: 'Category', key: 'categoryName', width: 18 },
      { header: 'Subject', key: 'subject', width: 30 },
      { header: 'Reason', key: 'reason', width: 40 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Routed to', key: 'routedTo', width: 20 },
      { header: 'Resolution', key: 'resolution', width: 34 },
      { header: 'Filed on', key: 'createdAt', width: 14 },
    ],
    rows.map((r) => ({
      employeeName: r.employeeName ?? '',
      categoryName: r.categoryName ?? '',
      subject: r.subject,
      reason: r.reason,
      status: r.status,
      routedTo: r.routedTo.join(', '),
      resolution: r.resolution ?? '',
      createdAt: r.createdAt.slice(0, 10),
    })),
  );
  return { buffer, filename: `complaints-${query.scope}.xlsx` };
}
