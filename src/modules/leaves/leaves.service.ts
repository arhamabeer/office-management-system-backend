import { Types } from 'mongoose';
import type {
  LeaveTypeDTO,
  LeavePolicyDTO,
  LeaveBalanceDTO,
  LeaveRequestDTO,
  LeaveRequestStatus,
} from '@ems/types';
import type {
  CreateLeaveTypeInput,
  UpdateLeaveTypeInput,
  UpdateLeavePolicyInput,
  ApplyLeaveInput,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { LeaveType, type LeaveTypeDoc } from './leaveType.model';
import { LeavePolicy, type LeavePolicyDoc } from './leavePolicy.model';
import { LeaveRequest, type LeaveRequestDoc } from './leaveRequest.model';
import { LeaveLedger } from './leaveLedger.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { Attendance } from '../attendance/attendance.model';
import { AttendancePolicy, Holiday } from '../attendance/config.model';
import {
  workingDays,
  computeRemaining,
  isWithinProbation,
  leaveYearOf,
} from './leaves.util';
import { scopedUserIds } from '../../common/scope';
import { recordAudit } from '../../middleware/audit';
import { notify } from '../../common/notify';
import { buildXlsx } from '../../common/xlsx';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';

const currentYear = () => leaveYearOf(new Date().toISOString());

// ---- mappers ----

function typeDTO(t: LeaveTypeDoc): LeaveTypeDTO {
  return {
    id: String(t._id),
    name: t.name,
    code: t.code,
    defaultQuota: t.defaultQuota,
    paid: t.paid ?? true,
    requiresApproval: t.requiresApproval ?? true,
    color: t.color ?? undefined,
  };
}

function policyDTO(p: LeavePolicyDoc): LeavePolicyDTO {
  return {
    leaveYear: (p.leaveYear ?? 'calendar') as 'calendar' | 'fiscal',
    accrualMode: (p.accrualMode ?? 'upfront') as 'upfront' | 'monthly',
    carryForwardCap: p.carryForwardCap ?? 10,
    encashment: p.encashment ?? false,
    probationMonths: p.probationMonths ?? 3,
    probationSickOnly: p.probationSickOnly ?? true,
    twoStepApproval: p.twoStepApproval ?? false,
  };
}

function reqDTO(r: LeaveRequestDoc, type?: { name: string; code: string }, employeeName?: string): LeaveRequestDTO {
  return {
    id: String(r._id),
    userId: String(r.userId),
    employeeName,
    typeId: String(r.typeId),
    typeName: type?.name ?? '',
    code: type?.code ?? '',
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    reason: r.reason,
    status: r.status as LeaveRequestStatus,
    approverId: r.approverId ? String(r.approverId) : undefined,
    decidedById: r.decidedById ? String(r.decidedById) : undefined,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : undefined,
    comment: r.comment ?? undefined,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

// ---- config ----

export async function getPolicyDoc(): Promise<LeavePolicyDoc> {
  const existing = await LeavePolicy.findOne({ key: 'default' });
  if (existing) return existing;
  // Race-safe singleton init: two concurrent first-callers must not both insert
  // the 'default' policy (the unique `key` index would 500 one of them).
  try {
    await LeavePolicy.create({ key: 'default' });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await LeavePolicy.findOne({ key: 'default' }))!;
}

export async function getPolicy(): Promise<LeavePolicyDTO> {
  return policyDTO(await getPolicyDoc());
}

export async function updatePolicy(actor: AuthUser, input: UpdateLeavePolicyInput): Promise<LeavePolicyDTO> {
  const p = await getPolicyDoc();
  Object.assign(p, input);
  await p.save();
  await recordAudit({ action: 'leave.policy_updated', actorId: actor.id, actorLabel: actor.email });
  return policyDTO(p);
}

export async function listTypes(): Promise<LeaveTypeDTO[]> {
  const types = await LeaveType.find({ active: true }).sort({ name: 1 });
  return types.map(typeDTO);
}

export async function createType(actor: AuthUser, input: CreateLeaveTypeInput): Promise<LeaveTypeDTO> {
  if (await LeaveType.exists({ code: input.code })) throw new ConflictError('A leave type with this code already exists');
  const t = await LeaveType.create({ ...input });
  await recordAudit({ action: 'leave.type_created', actorId: actor.id, actorLabel: actor.email, meta: { code: input.code } });
  return typeDTO(t);
}

export async function updateType(actor: AuthUser, id: string, input: UpdateLeaveTypeInput): Promise<LeaveTypeDTO> {
  const t = await LeaveType.findById(id);
  if (!t) throw new NotFoundError('Leave type not found');
  // Guard a code change against a collision (no global duplicate-key handler).
  if (input.code && input.code.toUpperCase() !== t.code) {
    if (await LeaveType.exists({ code: input.code.toUpperCase(), _id: { $ne: t._id } })) {
      throw new ConflictError('A leave type with this code already exists');
    }
  }
  Object.assign(t, input);
  await t.save();
  await recordAudit({ action: 'leave.type_updated', actorId: actor.id, actorLabel: actor.email, meta: { code: t.code } });
  return typeDTO(t);
}

export async function deactivateType(actor: AuthUser, id: string): Promise<void> {
  const t = await LeaveType.findById(id);
  if (!t) throw new NotFoundError('Leave type not found');
  t.active = false;
  await t.save();
  await recordAudit({ action: 'leave.type_deactivated', actorId: actor.id, actorLabel: actor.email, meta: { code: t.code } });
}

// ---- balances ----

export async function getBalances(userId: string, year?: number): Promise<LeaveBalanceDTO[]> {
  const y = year ?? currentYear();
  const [types, requests] = await Promise.all([
    LeaveType.find({ active: true }).sort({ name: 1 }),
    LeaveRequest.find({ userId, year: y, status: { $in: ['Approved', 'Pending'] } }),
  ]);
  return types.map((t) => {
    const forType = requests.filter((r) => String(r.typeId) === String(t._id));
    const used = forType.filter((r) => r.status === 'Approved').reduce((s, r) => s + r.days, 0);
    const pending = forType.filter((r) => r.status === 'Pending').reduce((s, r) => s + r.days, 0);
    const carriedForward = 0; // computed at year rollover (M3: no prior year)
    return {
      typeId: String(t._id),
      typeName: t.name,
      code: t.code,
      paid: t.paid ?? true,
      entitled: t.defaultQuota,
      carriedForward,
      used,
      pending,
      remaining: computeRemaining(t.defaultQuota, carriedForward, used),
    };
  });
}

// ---- working-days helper ----

async function computeLeaveDays(start: string, end: string): Promise<string[]> {
  const [attPolicy, holidays] = await Promise.all([
    AttendancePolicy.findOne({ key: 'default' }),
    Holiday.find({ date: { $gte: start, $lte: end } }).select('date'),
  ]);
  const weekOff = attPolicy?.weekOff ?? [0, 6];
  const holidaySet = new Set(holidays.map((h) => h.date));
  return workingDays(start, end, weekOff, holidaySet);
}

// ---- apply / list / cancel / decide ----

export async function applyLeave(userId: string, input: ApplyLeaveInput): Promise<LeaveRequestDTO> {
  const type = await LeaveType.findById(input.typeId);
  if (!type || !type.active) throw new NotFoundError('Leave type not found');
  if (leaveYearOf(input.startDate) !== leaveYearOf(input.endDate)) {
    throw new ValidationError('A leave request cannot span two calendar years');
  }
  const year = leaveYearOf(input.startDate);
  const dayList = await computeLeaveDays(input.startDate, input.endDate);
  if (dayList.length === 0) {
    throw new ValidationError('The selected range has no working days (weekends/holidays only)');
  }
  const days = dayList.length;

  const overlap = await LeaveRequest.findOne({
    userId,
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
  });
  if (overlap) throw new ConflictError('This range overlaps an existing leave request');

  const profile = await EmployeeProfile.findOne({ userId }).select('joiningDate reportsToId firstName lastName');
  const policy = await getPolicyDoc();

  if (
    type.paid &&
    (policy.probationSickOnly ?? true) &&
    type.code !== 'SICK' &&
    isWithinProbation(profile?.joiningDate, input.startDate, policy.probationMonths ?? 3)
  ) {
    throw new ValidationError('Paid leave is not allowed during probation (Sick leave excepted)');
  }

  // Atomic quota gate (paid types only): reserve `days` against a
  // per-(user, type, year) ledger with a conditional single-document update, so
  // two concurrent applications cannot both pass the check and double-spend the
  // allowance. Config-driven cap (later + carriedForward); no transaction needed.
  if (type.paid) {
    const cap = type.defaultQuota;
    // Ensure the ledger row exists (idempotent; a concurrent upsert may win the
    // unique-index race, so swallow the duplicate-key error).
    try {
      await LeaveLedger.updateOne(
        { userId, typeId: type._id, year },
        { $setOnInsert: { userId, typeId: type._id, year, reserved: 0 } },
        { upsert: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    const reserved = await LeaveLedger.findOneAndUpdate(
      { userId, typeId: type._id, year, reserved: { $lte: cap - days } },
      { $inc: { reserved: days } },
      { new: true },
    );
    if (!reserved) {
      const cur = await LeaveLedger.findOne({ userId, typeId: type._id, year });
      const available = cap - (cur?.reserved ?? 0);
      throw new ValidationError(`Insufficient ${type.name} balance: ${available} day(s) available, ${days} requested`);
    }
  }

  let req: LeaveRequestDoc;
  try {
    req = await LeaveRequest.create({
      userId,
      typeId: type._id,
      year,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      reason: input.reason,
      status: 'Pending',
      approverId: profile?.reportsToId ?? undefined,
    });
  } catch (err) {
    // Roll back the reservation if the request insert failed.
    if (type.paid) {
      await LeaveLedger.updateOne({ userId, typeId: type._id, year }, { $inc: { reserved: -days } });
    }
    throw err;
  }
  await recordAudit({ action: 'leave.applied', actorId: userId, targetType: 'LeaveRequest', targetId: String(req._id), meta: { type: type.code, days } });
  if (profile?.reportsToId) {
    const who = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'An employee';
    await notify({
      userId: String(profile.reportsToId),
      type: 'approval.pending',
      title: 'Leave request to review',
      body: `${who} requested ${days} day(s) of ${type.name} (${input.startDate} to ${input.endDate}).`,
      link: '/approvals',
      email: true,
    });
  }
  return reqDTO(req, { name: type.name, code: type.code });
}

async function typeMap(): Promise<Map<string, { name: string; code: string }>> {
  const types = await LeaveType.find();
  return new Map(types.map((t) => [String(t._id), { name: t.name, code: t.code }]));
}

async function nameMap(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const profs = await EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName');
  return new Map(profs.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]));
}

export async function listRequests(
  actor: AuthUser,
  scope: 'mine' | 'pending' | 'team',
  year?: number,
): Promise<LeaveRequestDTO[]> {
  const filter: Record<string, unknown> = {};
  if (scope === 'mine') {
    filter.userId = actor.id;
    if (year) filter.year = year;
  } else {
    const { orgWide, ids } = await scopedUserIds(actor);
    if (!orgWide) filter.userId = { $in: ids };
    if (scope === 'pending') filter.status = 'Pending';
    if (year) filter.year = year;
  }
  const docs = await LeaveRequest.find(filter).sort({ createdAt: -1 });
  const [types, names] = await Promise.all([typeMap(), nameMap(docs.map((d) => d.userId))]);
  return docs.map((d) => reqDTO(d, types.get(String(d.typeId)), names.get(String(d.userId))));
}

export async function getTeamCalendar(actor: AuthUser, month?: string): Promise<LeaveRequestDTO[]> {
  const m = month ?? new Date().toISOString().slice(0, 7);
  const { orgWide, ids } = await scopedUserIds(actor);
  const filter: Record<string, unknown> = {
    status: 'Approved',
    startDate: { $lte: `${m}-31` },
    endDate: { $gte: `${m}-01` },
  };
  if (!orgWide) filter.userId = { $in: ids };
  const docs = await LeaveRequest.find(filter).sort({ startDate: 1 });
  const [types, names] = await Promise.all([typeMap(), nameMap(docs.map((d) => d.userId))]);
  return docs.map((d) => reqDTO(d, types.get(String(d.typeId)), names.get(String(d.userId))));
}

export async function cancelRequest(actor: AuthUser, id: string): Promise<LeaveRequestDTO> {
  const req = await LeaveRequest.findById(id);
  if (!req) throw new NotFoundError('Leave request not found');
  const isSelf = String(req.userId) === actor.id;
  const isAdmin = actor.accountType === 'Owner' || actor.orgRole === 'Admin';
  if (!isSelf && !isAdmin) throw new ForbiddenError('You cannot cancel this request');
  if (req.status === 'Rejected' || req.status === 'Cancelled') {
    throw new ConflictError('This request cannot be cancelled');
  }
  const wasApproved = req.status === 'Approved';
  const wasActive = req.status === 'Pending' || req.status === 'Approved';
  req.status = 'Cancelled';
  await req.save();
  if (wasActive) {
    // Release the held quota. No-op for unpaid types (no ledger row exists).
    await LeaveLedger.updateOne(
      { userId: req.userId, typeId: req.typeId, year: req.year },
      { $inc: { reserved: -req.days } },
    );
  }
  if (wasApproved) {
    // remove the OnLeave attendance rows created on approval
    const days = await computeLeaveDays(req.startDate, req.endDate);
    await Attendance.deleteMany({ userId: req.userId, date: { $in: days }, status: 'OnLeave' });
  }
  await recordAudit({ action: 'leave.cancelled', actorId: actor.id, actorLabel: actor.email, targetType: 'LeaveRequest', targetId: String(req._id) });
  const types = await typeMap();
  return reqDTO(req, types.get(String(req.typeId)));
}

export async function exportRequests(
  actor: AuthUser,
  scope: 'mine' | 'pending' | 'team',
  year?: number,
): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await listRequests(actor, scope, year);
  const buffer = await buildXlsx(
    'Leave requests',
    [
      { header: 'Employee', key: 'employeeName', width: 24 },
      { header: 'Type', key: 'typeName', width: 16 },
      { header: 'From', key: 'startDate', width: 12 },
      { header: 'To', key: 'endDate', width: 12 },
      { header: 'Days', key: 'days', width: 8 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Reason', key: 'reason', width: 34 },
      { header: 'Decided on', key: 'decidedAt', width: 14 },
    ],
    rows.map((r) => ({
      employeeName: r.employeeName ?? '',
      typeName: r.typeName,
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      status: r.status,
      reason: r.reason,
      decidedAt: r.decidedAt ? r.decidedAt.slice(0, 10) : '',
    })),
  );
  return { buffer, filename: `leave-requests-${scope}${year ? `-${year}` : ''}.xlsx` };
}

export async function decideRequest(
  actor: AuthUser,
  id: string,
  approve: boolean,
  comment?: string,
): Promise<LeaveRequestDTO> {
  const req = await LeaveRequest.findById(id);
  if (!req) throw new NotFoundError('Leave request not found');
  if (req.status !== 'Pending') throw new ConflictError('This request has already been decided');

  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === String(req.userId));
  if (!inScope) throw new ForbiddenError('This request is outside your team');
  if (String(req.userId) === actor.id && !orgWide) throw new ForbiddenError('You cannot approve your own request');

  if (approve) {
    req.status = 'Approved';
    const days = await computeLeaveDays(req.startDate, req.endDate);
    for (const date of days) {
      await Attendance.updateOne(
        { userId: req.userId, date },
        {
          $set: {
            userId: req.userId,
            date,
            status: 'OnLeave',
            source: 'AdminEntry',
            workedMinutes: 0,
            overtimeMinutes: 0,
            createdById: new Types.ObjectId(actor.id),
          },
        },
        { upsert: true },
      );
    }
  } else {
    req.status = 'Rejected';
    // Release the reservation held since apply time (Approved keeps it).
    await LeaveLedger.updateOne(
      { userId: req.userId, typeId: req.typeId, year: req.year },
      { $inc: { reserved: -req.days } },
    );
  }
  req.decidedById = new Types.ObjectId(actor.id);
  req.decidedAt = new Date();
  if (comment) req.comment = comment;
  await req.save();

  await recordAudit({
    action: approve ? 'leave.approved' : 'leave.rejected',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'LeaveRequest',
    targetId: String(req._id),
    meta: { employee: String(req.userId) },
  });
  const types = await typeMap();
  await notify({
    userId: String(req.userId),
    type: 'leave.decided',
    title: `Leave ${approve ? 'approved' : 'rejected'}`,
    body: `Your ${types.get(String(req.typeId))?.name ?? 'leave'} request (${req.startDate} to ${req.endDate}) was ${approve ? 'approved' : 'rejected'}${comment ? `: ${comment}` : ''}.`,
    link: '/leaves',
    email: true,
  });
  return reqDTO(req, types.get(String(req.typeId)));
}
