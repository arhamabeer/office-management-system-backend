import { Schema, Types } from 'mongoose';
import {
  REQUEST_ROUTE_TARGETS,
  REQUEST_STATUSES,
  REQUEST_TIMELINE_ACTIONS,
  isAtLeast,
} from '@ems/types';
import type { RequestAction, RequestRouteTarget, RequestStatus } from '@ems/types';
import type { AuthUser } from '../middleware/auth';
import { User } from '../modules/auth/user.model';
import { EmployeeProfile } from '../modules/employees/employeeProfile.model';
import { scopedUserIds } from './scope';
import { notify, notifyMany } from './notify';

/**
 * Shared routing/resolution engine for "routable requests" — complaints and
 * inventory requests. Both have the identical lifecycle:
 *
 *   Submitted ──(manager)──> Resolved | Rejected
 *                         └─> Forwarded (to Operations and/or Admin)
 *   Forwarded ──(handler)──> Resolved | Rejected
 *                         └─> (Operations only) re-Forwarded to Admin
 *
 * The pure state machine (applyRequestAction) lives here; each module's service
 * loads the doc, computes the actor's capabilities, applies the transition,
 * appends a timeline entry, audits and notifies.
 */

// ---------------------------------------------------------------- state machine

export class RequestWorkflowError extends Error {
  constructor(
    message: string,
    public readonly kind: 'forbidden' | 'conflict',
  ) {
    super(message);
    this.name = 'RequestWorkflowError';
  }
}

export interface RequestActorCaps {
  /** May act at the manager stage for THIS request (team approver, or admin). */
  canManage: boolean;
  /** May act on the Operations handler queue. */
  canActOps: boolean;
  /** May act on the Admin handler queue. */
  canActAdmin: boolean;
}

export interface ApplyResult {
  status: RequestStatus;
  routedTo: RequestRouteTarget[];
  /** Which stage the action was taken at (for the timeline + notifications). */
  stage: 'manager' | 'operations' | 'admin';
}

const MANAGER_FORWARDS: Partial<Record<RequestAction, RequestRouteTarget[]>> = {
  forward_operations: ['Operations'],
  forward_admin: ['Admin'],
  forward_both: ['Operations', 'Admin'],
};

/** Compute the next state for an action, or throw a RequestWorkflowError. Pure. */
export function applyRequestAction(
  state: { status: RequestStatus; routedTo: RequestRouteTarget[] },
  action: RequestAction,
  caps: RequestActorCaps,
): ApplyResult {
  if (state.status === 'Resolved' || state.status === 'Rejected') {
    throw new RequestWorkflowError('This request has already been closed', 'conflict');
  }

  if (state.status === 'Submitted') {
    if (!caps.canManage) {
      throw new RequestWorkflowError('Only a manager for this request can act on it', 'forbidden');
    }
    if (action === 'resolve') return { status: 'Resolved', routedTo: [], stage: 'manager' };
    if (action === 'reject') return { status: 'Rejected', routedTo: [], stage: 'manager' };
    const fwd = MANAGER_FORWARDS[action];
    if (fwd) return { status: 'Forwarded', routedTo: [...fwd], stage: 'manager' };
    throw new RequestWorkflowError('That action is not available at the manager stage', 'conflict');
  }

  // state.status === 'Forwarded' (handler stage)
  const actingOps = state.routedTo.includes('Operations') && caps.canActOps;
  const actingAdmin = state.routedTo.includes('Admin') && caps.canActAdmin;
  if (!actingOps && !actingAdmin) {
    throw new RequestWorkflowError('This request is not in your queue', 'forbidden');
  }
  const stage: 'operations' | 'admin' = actingOps ? 'operations' : 'admin';
  if (action === 'resolve') return { status: 'Resolved', routedTo: [], stage };
  if (action === 'reject') return { status: 'Rejected', routedTo: [], stage };
  if (action === 'forward_admin') {
    // Only Operations may re-forward to Admin (when it will not resolve/reject).
    if (!actingOps) {
      throw new RequestWorkflowError('Only Operations can forward to Admin at this stage', 'forbidden');
    }
    return { status: 'Forwarded', routedTo: ['Admin'], stage: 'operations' };
  }
  throw new RequestWorkflowError('That action is not available at the handler stage', 'conflict');
}

// ---------------------------------------------------------------- capabilities / scope

function isOrgAdmin(actor: AuthUser): boolean {
  return actor.accountType === 'Owner' || actor.orgRole === 'Admin';
}

/** Resolve what `actor` may do to a request filed by `filerId`. */
export async function capsFor(actor: AuthUser, filerId: string): Promise<RequestActorCaps> {
  const admin = isOrgAdmin(actor);
  const caps: RequestActorCaps = {
    canManage: admin,
    canActOps: admin || actor.orgRole === 'Operations',
    canActAdmin: admin,
  };
  if (!caps.canManage && isAtLeast(actor.orgRole, 'Lead')) {
    const { orgWide, ids } = await scopedUserIds(actor);
    // A Lead/Manager manages a request only for someone in their team scope, and
    // never their own (self-handling is blocked; admins are orgWide and exempt).
    caps.canManage = orgWide || (filerId !== actor.id && ids.some((i) => String(i) === String(filerId)));
  }
  return caps;
}

/**
 * Mongo filter for the requests awaiting THIS actor's action (the "inbox"):
 * Submitted items in their manager scope (Lead+), plus Forwarded items in the
 * Operations/Admin queues they staff. Shared by the list and the badge count so
 * they always agree. Matches nothing when the actor has no queue.
 */
export async function buildInboxFilter(actor: AuthUser): Promise<Record<string, unknown>> {
  const admin = isOrgAdmin(actor);
  const isOps = admin || actor.orgRole === 'Operations';
  const canManage = admin || isAtLeast(actor.orgRole, 'Lead');
  const or: Record<string, unknown>[] = [];
  if (canManage) {
    const mgr: Record<string, unknown> = { status: 'Submitted' };
    if (!admin) {
      const { ids } = await scopedUserIds(actor);
      mgr.userId = { $in: ids.filter((i) => String(i) !== actor.id) };
    }
    or.push(mgr);
  }
  if (isOps) or.push({ status: 'Forwarded', routedTo: 'Operations' });
  if (admin) or.push({ status: 'Forwarded', routedTo: 'Admin' });
  return or.length ? { $or: or } : { _id: { $exists: false } };
}

/** The role label recorded on a timeline entry for `actor`. */
export function actorRoleLabel(actor: AuthUser): string {
  return actor.accountType === 'Owner' ? 'Owner' : actor.orgRole;
}

// ---------------------------------------------------------------- recipients (DB)

/** Active user ids staffing the given handler queues (Admin queue includes Owners). */
export async function handlerUserIds(targets: RequestRouteTarget[]): Promise<string[]> {
  const or: Record<string, unknown>[] = [];
  if (targets.includes('Operations')) or.push({ orgRole: 'Operations' });
  if (targets.includes('Admin')) or.push({ orgRole: 'Admin' }, { accountType: 'Owner' });
  if (!or.length) return [];
  const users = await User.find({ status: 'Active', $or: or }).select('_id');
  return users.map((u) => String(u._id));
}

/** A user's display name ("First Last") from their profile, if any. */
export async function displayName(userId: string): Promise<string | undefined> {
  const prof = await EmployeeProfile.findOne({ userId }).select('firstName lastName');
  if (!prof) return undefined;
  return `${prof.firstName ?? ''} ${prof.lastName ?? ''}`.trim() || undefined;
}

/** Map of userId -> display name, for list rendering. */
export async function nameMap(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const profs = await EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName');
  return new Map(profs.map((p) => [String(p.userId), `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()]));
}

/** Notify the filer's manager (reportsTo) that a new request needs review;
 *  if they have no manager on file, fall back to the Admin queue. Best-effort. */
export async function notifyNewRequest(filerId: string, title: string, body: string): Promise<void> {
  const prof = await EmployeeProfile.findOne({ userId: filerId }).select('reportsToId');
  if (prof?.reportsToId) {
    await notify({ userId: String(prof.reportsToId), type: 'approval.pending', title, body, link: '/approvals', email: true });
  } else {
    await notifyMany(await handlerUserIds(['Admin']), { type: 'approval.pending', title, body, link: '/approvals' }, filerId);
  }
}

// ---------------------------------------------------------------- shared schema pieces

export const timelineEntrySchema = new Schema(
  {
    at: { type: Date, required: true },
    byId: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    byRole: { type: String },
    action: { type: String, enum: REQUEST_TIMELINE_ACTIONS, required: true },
    note: { type: String },
    routedTo: { type: [{ type: String, enum: REQUEST_ROUTE_TARGETS }], default: undefined },
  },
  { _id: false },
);

/** Lifecycle fields every routable-request model shares. Spread into the schema
 *  definition alongside the module's own domain fields. */
export const requestWorkflowFields = {
  orgId: { type: Schema.Types.ObjectId },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true },
  details: { type: String },
  status: { type: String, enum: REQUEST_STATUSES, default: 'Submitted', index: true },
  routedTo: { type: [{ type: String, enum: REQUEST_ROUTE_TARGETS }], default: [] },
  resolution: { type: String },
  decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
  timeline: { type: [timelineEntrySchema], default: [] },
};

/** Build the initial timeline entry for a freshly-filed request. */
export function filedTimelineEntry(actor: AuthUser, name: string | undefined, note?: string) {
  return {
    at: new Date(),
    byId: new Types.ObjectId(actor.id),
    byName: name,
    byRole: actorRoleLabel(actor),
    action: 'submitted' as const,
    note,
  };
}
