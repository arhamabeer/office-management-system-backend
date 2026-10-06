import { Types } from 'mongoose';
import type {
  InventoryCategoryDTO,
  InventoryRequestDTO,
  RequestStatus,
  RequestRouteTarget,
  RequestTimelineAction,
} from '@ems/types';
import type {
  CreateInventoryCategoryInput,
  UpdateInventoryCategoryInput,
  CreateInventoryRequestInput,
  RequestDecisionInput,
  RequestScopeQuery,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { InventoryCategory, type InventoryCategoryDoc } from './inventoryCategory.model';
import { InventoryRequest, type InventoryRequestDoc } from './inventoryRequest.model';
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
  initialRequestRouting,
  filedTimelineEntry,
  RequestWorkflowError,
} from '../../common/requestWorkflow';

// ---------------------------------------------------------------- mappers

function categoryDTO(c: InventoryCategoryDoc): InventoryCategoryDTO {
  return { id: String(c._id), name: c.name, code: c.code, active: c.active ?? true };
}

function requestDTO(
  c: InventoryRequestDoc,
  categoryName?: string,
  employeeName?: string,
): InventoryRequestDTO {
  return {
    id: String(c._id),
    userId: String(c.userId),
    employeeName,
    categoryId: String(c.categoryId),
    categoryName,
    itemName: c.itemName,
    quantity: c.quantity,
    neededBy: c.neededBy ?? undefined,
    reason: c.reason,
    details: c.details ?? undefined,
    status: c.status as RequestStatus,
    routedTo: (c.routedTo ?? []) as RequestRouteTarget[],
    resolution: c.resolution ?? undefined,
    decidedById: c.decidedById ? String(c.decidedById) : undefined,
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
  const cats = await InventoryCategory.find().select('name');
  return new Map(cats.map((c) => [String(c._id), c.name]));
}

// ---------------------------------------------------------------- config: categories

export async function listCategories(includeInactive = false): Promise<InventoryCategoryDTO[]> {
  const filter = includeInactive ? {} : { active: true };
  const cats = await InventoryCategory.find(filter).sort({ name: 1 });
  return cats.map(categoryDTO);
}

export async function createCategory(actor: AuthUser, input: CreateInventoryCategoryInput): Promise<InventoryCategoryDTO> {
  if (await InventoryCategory.exists({ code: input.code.toUpperCase() })) {
    throw new ConflictError('An inventory category with this code already exists');
  }
  const c = await InventoryCategory.create({ ...input });
  await recordAudit({ action: 'inventory.category_created', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function updateCategory(actor: AuthUser, id: string, input: UpdateInventoryCategoryInput): Promise<InventoryCategoryDTO> {
  const c = await InventoryCategory.findById(id);
  if (!c) throw new NotFoundError('Inventory category not found');
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'inventory.category_updated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
  return categoryDTO(c);
}

export async function deactivateCategory(actor: AuthUser, id: string): Promise<void> {
  const c = await InventoryCategory.findById(id);
  if (!c) throw new NotFoundError('Inventory category not found');
  c.active = false;
  await c.save();
  await recordAudit({ action: 'inventory.category_deactivated', actorId: actor.id, actorLabel: actor.email, meta: { code: c.code } });
}

// ---------------------------------------------------------------- file / list

export async function createRequest(actor: AuthUser, input: CreateInventoryRequestInput): Promise<InventoryRequestDTO> {
  const category = await InventoryCategory.findById(input.categoryId);
  if (!category || !category.active) throw new NotFoundError('Inventory category not found');
  const name = await displayName(actor.id);
  const routing = await initialRequestRouting(actor.id);
  const doc = await InventoryRequest.create({
    userId: new Types.ObjectId(actor.id),
    categoryId: category._id,
    itemName: input.itemName,
    quantity: input.quantity,
    neededBy: input.neededBy,
    reason: input.reason,
    details: input.details,
    status: routing.status,
    routedTo: routing.routedTo,
    timeline: [filedTimelineEntry(actor, name)],
  });
  await recordAudit({ action: 'inventory.filed', actorId: actor.id, actorLabel: actor.email, targetType: 'InventoryRequest', targetId: String(doc._id), meta: { category: category.code, item: input.itemName, quantity: input.quantity } });
  await notifyNewRequest(actor.id, 'Inventory request to review', `${name ?? 'An employee'} requested ${input.quantity} × ${input.itemName}.`);
  return requestDTO(doc, category.name, name);
}

export async function listRequests(actor: AuthUser, query: RequestScopeQuery): Promise<InventoryRequestDTO[]> {
  let filter: Record<string, unknown>;
  if (query.scope === 'mine') {
    filter = { userId: actor.id };
  } else if (query.scope === 'inbox') {
    filter = await buildInboxFilter(actor);
  } else {
    const isAdmin = actor.accountType === 'Owner' || actor.orgRole === 'Admin';
    filter = isAdmin ? {} : await buildInboxFilter(actor);
  }
  const docs = await InventoryRequest.find(filter).sort({ createdAt: -1 });
  const [cats, names] = await Promise.all([categoryMap(), nameMap(docs.map((d) => d.userId))]);
  return docs.map((d) => requestDTO(d, cats.get(String(d.categoryId)), names.get(String(d.userId))));
}

export async function getRequest(actor: AuthUser, id: string): Promise<InventoryRequestDTO> {
  const doc = await InventoryRequest.findById(id);
  if (!doc) throw new NotFoundError('Inventory request not found');
  const isOwnerOfRecord = String(doc.userId) === actor.id;
  const caps = await capsFor(actor, String(doc.userId));
  const canSee = isOwnerOfRecord || caps.canManage || caps.canActOps || caps.canActAdmin;
  if (!canSee) throw new ForbiddenError('You cannot view this inventory request');
  const [cats, names] = await Promise.all([categoryMap(), nameMap([doc.userId])]);
  return requestDTO(doc, cats.get(String(doc.categoryId)), names.get(String(doc.userId)));
}

// ---------------------------------------------------------------- decide (the 5-action workflow)

export async function decideRequest(actor: AuthUser, id: string, input: RequestDecisionInput): Promise<InventoryRequestDTO> {
  const doc = await InventoryRequest.findById(id);
  if (!doc) throw new NotFoundError('Inventory request not found');

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
    action: `inventory.${input.action}`,
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'InventoryRequest',
    targetId: String(doc._id),
    meta: { status: result.status, routedTo: result.routedTo },
  });

  if (result.status === 'Forwarded') {
    const recipients = await handlerUserIds(result.routedTo);
    await notifyMany(
      recipients,
      {
        type: 'inventory.forwarded',
        title: 'Inventory request forwarded to you',
        body: `A request for ${doc.quantity} × ${doc.itemName} was forwarded for your action${input.note ? `: ${input.note}` : ''}.`,
        link: '/approvals',
        email: true,
      },
      actor.id,
    );
  } else {
    await notify({
      userId: String(doc.userId),
      type: 'inventory.decided',
      title: `Inventory request ${result.status.toLowerCase()}`,
      body: `Your request for ${doc.quantity} × ${doc.itemName} was ${result.status.toLowerCase()}${input.note ? `: ${input.note}` : ''}.`,
      link: '/inventory-requests',
      email: true,
    });
  }

  const cats = await categoryMap();
  return requestDTO(doc, cats.get(String(doc.categoryId)), name);
}

// ---------------------------------------------------------------- export

export async function exportRequests(actor: AuthUser, query: RequestScopeQuery): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await listRequests(actor, query);
  const buffer = await buildXlsx(
    'Inventory requests',
    [
      { header: 'Employee', key: 'employeeName', width: 24 },
      { header: 'Category', key: 'categoryName', width: 18 },
      { header: 'Item', key: 'itemName', width: 26 },
      { header: 'Qty', key: 'quantity', width: 8 },
      { header: 'Needed by', key: 'neededBy', width: 13 },
      { header: 'Reason', key: 'reason', width: 36 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Routed to', key: 'routedTo', width: 20 },
      { header: 'Resolution', key: 'resolution', width: 30 },
      { header: 'Filed on', key: 'createdAt', width: 14 },
    ],
    rows.map((r) => ({
      employeeName: r.employeeName ?? '',
      categoryName: r.categoryName ?? '',
      itemName: r.itemName,
      quantity: r.quantity,
      neededBy: r.neededBy ?? '',
      reason: r.reason,
      status: r.status,
      routedTo: r.routedTo.join(', '),
      resolution: r.resolution ?? '',
      createdAt: r.createdAt.slice(0, 10),
    })),
  );
  return { buffer, filename: `inventory-requests-${query.scope}.xlsx` };
}
