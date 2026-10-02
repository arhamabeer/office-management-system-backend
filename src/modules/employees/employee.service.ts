import { Types, type FilterQuery } from 'mongoose';
import type { EmployeeProfileDTO, Paginated, EmployeeImportResultDTO } from '@ems/types';
import { createEmployeeSchema } from '@ems/validation';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  AssignRoleInput,
  ListEmployeesQuery,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { User } from '../auth/user.model';
import { EmployeeProfile, type EmployeeProfileDoc } from './employeeProfile.model';
import { Department } from '../departments/department.model';
import { generateOpaqueToken } from '../auth/token.service';
import { toProfileDTO } from '../../common/mappers';
import { pageMeta } from '../../common/httpResponse';
import { recordAudit } from '../../middleware/audit';
import { sendInviteEmail } from '../../common/mailer';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { env, isProd } from '../../config/env';
import { BRAND } from '@ems/config';

type ProfileFilter = FilterQuery<EmployeeProfileDoc>;

function isOrgWide(actor: AuthUser): boolean {
  return actor.accountType === 'Owner' || actor.orgRole === 'Admin';
}

/** Build the profile filter enforcing the actor's visibility scope (PLAN.md §9). */
async function scopeFilter(actor: AuthUser): Promise<ProfileFilter> {
  if (isOrgWide(actor)) return {};
  const selfId = new Types.ObjectId(actor.id);

  if (actor.orgRole === 'Manager') {
    const managed = await Department.find({ managerId: selfId }).select('_id');
    const managedIds = managed.map((d) => d._id);
    const descendants = managedIds.length
      ? await Department.find({ ancestors: { $in: managedIds } }).select('_id')
      : [];
    const deptIds = [...managedIds, ...descendants.map((d) => d._id)];
    const or: ProfileFilter[] = [{ reportsToId: selfId }, { leadId: selfId }];
    if (deptIds.length) or.push({ departmentId: { $in: deptIds } });
    return { $or: or };
  }
  if (actor.orgRole === 'Lead') {
    return { $or: [{ leadId: selfId }, { reportsToId: selfId }] };
  }
  // Member: self only
  return { userId: selfId };
}

function assertCanAssignRole(actor: AuthUser, accountType?: string, orgRole?: string): void {
  const grantingElevated = accountType === 'Owner' || orgRole === 'Admin';
  if (grantingElevated && actor.accountType !== 'Owner') {
    throw new ForbiddenError('Only an Owner can assign the Owner or Admin role');
  }
  // Operations is a privileged handler role (receives forwarded complaints /
  // inventory requests) — only an Owner or Admin may grant it.
  const actorIsOrgAdmin = actor.accountType === 'Owner' || actor.orgRole === 'Admin';
  if (orgRole === 'Operations' && !actorIsOrgAdmin) {
    throw new ForbiddenError('Only an Owner or Admin can assign the Operations role');
  }
  // Managers (who are not Owners) may only grant the Member or Lead org role —
  // never Manager, Admin or Operations.
  if (
    actor.accountType !== 'Owner' &&
    actor.orgRole === 'Manager' &&
    orgRole &&
    orgRole !== 'Member' &&
    orgRole !== 'Lead'
  ) {
    throw new ForbiddenError('Managers can only assign the Member or Lead role');
  }
}

async function hydrate(profiles: EmployeeProfileDoc[]): Promise<EmployeeProfileDTO[]> {
  if (!profiles.length) return [];
  const userIds = profiles.map((p) => p.userId);
  const deptIds = profiles.map((p) => p.departmentId).filter(Boolean) as Types.ObjectId[];
  const [users, depts] = await Promise.all([
    User.find({ _id: { $in: userIds } }),
    deptIds.length ? Department.find({ _id: { $in: deptIds } }).select('name') : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const deptMap = new Map(depts.map((d) => [String(d._id), d.name]));
  const out: EmployeeProfileDTO[] = [];
  for (const p of profiles) {
    const u = userMap.get(String(p.userId));
    if (!u) continue;
    out.push(toProfileDTO(p, u, p.departmentId ? deptMap.get(String(p.departmentId)) : undefined));
  }
  return out;
}

export async function listEmployees(
  actor: AuthUser,
  query: ListEmployeesQuery,
): Promise<Paginated<EmployeeProfileDTO>> {
  const filter: ProfileFilter = { ...(await scopeFilter(actor)) };
  const and: ProfileFilter[] = [];

  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ firstName: rx }, { lastName: rx }, { designation: rx }, { employeeCode: rx }] });
  }
  if (query.departmentId) and.push({ departmentId: new Types.ObjectId(query.departmentId) });

  // status / orgRole live on User → resolve to userIds
  if (query.status || query.orgRole) {
    const userFilter: FilterQuery<unknown> = {};
    if (query.status) userFilter.status = query.status;
    if (query.orgRole) userFilter.orgRole = query.orgRole;
    const users = await User.find(userFilter).select('_id');
    and.push({ userId: { $in: users.map((u) => u._id) } });
  }
  if (and.length) filter.$and = and;

  const sortField = query.sort && ['firstName', 'lastName', 'createdAt'].includes(query.sort)
    ? query.sort
    : 'firstName';
  const sort: Record<string, 1 | -1> = { [sortField]: query.order === 'desc' ? -1 : 1 };

  const [total, profiles] = await Promise.all([
    EmployeeProfile.countDocuments(filter),
    EmployeeProfile.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
  ]);

  return { items: await hydrate(profiles), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getEmployee(actor: AuthUser, id: string): Promise<EmployeeProfileDTO> {
  const scope = await scopeFilter(actor);
  const profile = await EmployeeProfile.findOne({ _id: new Types.ObjectId(id), ...scope });
  if (!profile) throw new NotFoundError('Employee not found or outside your scope');
  const [dto] = await hydrate([profile]);
  if (!dto) throw new NotFoundError('Employee not found');
  return dto;
}

export interface CreateResult {
  employee: EmployeeProfileDTO;
  inviteToken?: string;
  inviteUrl?: string;
}

export async function createEmployee(
  actor: AuthUser,
  input: CreateEmployeeInput,
): Promise<CreateResult> {
  assertCanAssignRole(actor, input.accountType, input.orgRole);

  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new ConflictError('A user with this email already exists');
  const biometricUserId = input.biometricUserId?.trim() || undefined;
  if (biometricUserId && (await EmployeeProfile.exists({ biometricUserId }))) {
    throw new ConflictError('That device ID is already assigned to another employee');
  }

  const { raw, hash } = generateOpaqueToken();
  const user = await User.create({
    email,
    accountType: input.accountType,
    orgRole: input.orgRole,
    status: 'Invited',
    inviteTokenHash: hash,
    inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const profile = await EmployeeProfile.create({
    userId: user._id,
    firstName: input.firstName,
    lastName: input.lastName,
    designation: input.designation,
    departmentId: input.departmentId ? new Types.ObjectId(input.departmentId) : undefined,
    employmentType: input.employmentType,
    joiningDate: input.joiningDate,
    reportsToId: input.reportsToId ? new Types.ObjectId(input.reportsToId) : undefined,
    leadId: input.leadId ? new Types.ObjectId(input.leadId) : undefined,
    phone: input.phone,
    biometricUserId,
    status: 'Invited',
  });

  await recordAudit({
    action: 'employee.created',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: String(user._id),
    meta: { email, accountType: input.accountType, orgRole: input.orgRole },
  });

  // Send the onboarding invitation (best-effort — creating the employee must
  // never fail because mail delivery hiccuped).
  const inviteUrl = `${env.WEB_ORIGIN}/accept-invite?token=${raw}`;
  void sendInviteEmail({
    to: email,
    name: input.firstName,
    inviteUrl,
    orgName: BRAND.productName,
    roleLabel: input.designation?.trim() || input.orgRole,
  }).catch(() => undefined);

  const [dto] = await hydrate([profile]);
  // In non-prod, also return the ready-to-share onboarding link for quick testing.
  return { employee: dto, inviteToken: isProd ? undefined : raw, inviteUrl: isProd ? undefined : inviteUrl };
}

export interface ResendResult {
  inviteUrl?: string;
  inviteToken?: string;
}

/**
 * Regenerate an invitee's onboarding link (resetting the 7-day expiry) and,
 * when `notify` is true, re-send the invitation email. Used by the "Resend
 * invite" and "Copy link" actions. Only valid while the account is still
 * pending (Invited). Regenerating invalidates any previously issued link.
 */
export async function resendInvite(actor: AuthUser, id: string, notify: boolean): Promise<ResendResult> {
  const scope = await scopeFilter(actor);
  const profile = await EmployeeProfile.findOne({ _id: new Types.ObjectId(id), ...scope });
  if (!profile) throw new NotFoundError('Employee not found or outside your scope');
  const targetUser = await User.findById(profile.userId);
  if (!targetUser) throw new NotFoundError('Employee not found');
  if (targetUser.status !== 'Invited') throw new ConflictError('This employee has already onboarded');

  const { raw, hash } = generateOpaqueToken();
  targetUser.inviteTokenHash = hash;
  targetUser.inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await targetUser.save();

  const inviteUrl = `${env.WEB_ORIGIN}/accept-invite?token=${raw}`;
  if (notify) {
    void sendInviteEmail({
      to: targetUser.email,
      name: profile.firstName,
      inviteUrl,
      orgName: BRAND.productName,
      roleLabel: profile.designation?.trim() || targetUser.orgRole,
    }).catch(() => undefined);
  }
  await recordAudit({
    action: notify ? 'employee.invite_resent' : 'employee.invite_link_generated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: String(targetUser._id),
  });
  return { inviteUrl: isProd ? undefined : inviteUrl, inviteToken: isProd ? undefined : raw };
}

export async function updateEmployee(
  actor: AuthUser,
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeProfileDTO> {
  const profile = await EmployeeProfile.findById(id);
  if (!profile) throw new NotFoundError('Employee not found');

  const isSelf = String(profile.userId) === actor.id;
  const canManage = isOrgWide(actor) || actor.orgRole === 'Manager';
  if (!isSelf && !canManage) throw new ForbiddenError('Not allowed to edit this employee');
  if (!isSelf && actor.orgRole === 'Manager') {
    // Manager may only edit within their team scope
    const scope = await scopeFilter(actor);
    const inScope = await EmployeeProfile.exists({ _id: profile._id, ...scope });
    if (!inScope) throw new ForbiddenError('Employee is outside your team');
  }

  if (input.firstName !== undefined) profile.firstName = input.firstName;
  if (input.lastName !== undefined) profile.lastName = input.lastName;
  if (input.phone !== undefined) profile.phone = input.phone;
  // Job fields are management-only (not self-editable)
  if (canManage) {
    if (input.designation !== undefined) profile.designation = input.designation;
    if (input.employmentType !== undefined) profile.employmentType = input.employmentType;
    if (input.joiningDate !== undefined) profile.joiningDate = input.joiningDate;
    if (input.departmentId !== undefined) profile.departmentId = new Types.ObjectId(input.departmentId);
    if (input.reportsToId !== undefined) profile.reportsToId = new Types.ObjectId(input.reportsToId);
    if (input.leadId !== undefined) profile.leadId = new Types.ObjectId(input.leadId);
    if (input.biometricUserId !== undefined) {
      const v = input.biometricUserId.trim();
      if (v && (await EmployeeProfile.exists({ biometricUserId: v, _id: { $ne: profile._id } }))) {
        throw new ConflictError('That device ID is already assigned to another employee');
      }
      profile.biometricUserId = v || undefined;
    }
  }
  await profile.save();
  const [dto] = await hydrate([profile]);
  return dto;
}

export async function assignRole(
  actor: AuthUser,
  id: string,
  input: AssignRoleInput,
): Promise<EmployeeProfileDTO> {
  const profile = await EmployeeProfile.findById(id);
  if (!profile) throw new NotFoundError('Employee not found');
  const user = await User.findById(profile.userId);
  if (!user) throw new NotFoundError('User not found');

  assertCanAssignRole(actor, input.accountType, input.orgRole);
  // Changing an existing Admin/Owner also requires Owner
  if ((user.orgRole === 'Admin' || user.accountType === 'Owner') && actor.accountType !== 'Owner') {
    throw new ForbiddenError('Only an Owner can change an Admin or Owner account');
  }
  // A Manager may only change Member/Lead accounts — not another Manager
  // (Admin/Owner targets are already blocked above).
  if (
    actor.accountType !== 'Owner' &&
    actor.orgRole === 'Manager' &&
    (user.orgRole === 'Manager' || user.orgRole === 'Admin' || user.accountType === 'Owner')
  ) {
    throw new ForbiddenError('Managers can only change Member or Lead accounts');
  }
  if (String(user._id) === actor.id) throw new ForbiddenError('You cannot change your own role');

  const before = { accountType: user.accountType, orgRole: user.orgRole };
  if (input.accountType) user.accountType = input.accountType;
  if (input.orgRole) user.orgRole = input.orgRole;
  await user.save();

  await recordAudit({
    action: 'user.role_changed',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: String(user._id),
    meta: { before, after: { accountType: user.accountType, orgRole: user.orgRole } },
  });

  const [dto] = await hydrate([profile]);
  return dto;
}

export async function deactivateEmployee(actor: AuthUser, id: string): Promise<void> {
  const profile = await EmployeeProfile.findById(id);
  if (!profile) throw new NotFoundError('Employee not found');
  const user = await User.findById(profile.userId);
  if (!user) throw new NotFoundError('User not found');
  if (String(user._id) === actor.id) throw new ForbiddenError('You cannot deactivate yourself');
  if ((user.orgRole === 'Admin' || user.accountType === 'Owner') && actor.accountType !== 'Owner') {
    throw new ForbiddenError('Only an Owner can deactivate an Admin or Owner account');
  }

  user.status = 'Deactivated';
  user.set('refreshTokens', []);
  // Invalidate any outstanding invite/reset links so a deactivated user cannot
  // self-reactivate via a still-valid onboarding link.
  user.inviteTokenHash = undefined;
  user.inviteExpiresAt = undefined;
  user.resetTokenHash = undefined;
  user.resetExpiresAt = undefined;
  await user.save();
  profile.status = 'Deactivated';
  await profile.save();

  await recordAudit({
    action: 'employee.deactivated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: String(user._id),
  });
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Bulk-create employees (sending invites) from CSV text. Each row is validated
 *  and created independently; failures are collected, not fatal. Header columns
 *  (case-insensitive): email, firstName, lastName, designation, orgRole,
 *  employmentType, department. Admin/Owner only (role gate on the route). */
export async function importEmployees(actor: AuthUser, csv: string): Promise<EmployeeImportResultDTO> {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new ValidationError('CSV must have a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const idx = {
    email: col('email'),
    firstName: col('firstname'),
    lastName: col('lastname'),
    designation: col('designation'),
    orgRole: col('orgrole'),
    employmentType: col('employmenttype'),
    department: col('department'),
  };
  if (idx.email < 0 || idx.firstName < 0 || idx.lastName < 0) {
    throw new ValidationError('CSV header must include at least: email, firstName, lastName');
  }

  const depts = await Department.find().select('name');
  const deptByName = new Map(depts.map((d) => [d.name.trim().toLowerCase(), String(d._id)]));

  const result: EmployeeImportResultDTO = { created: 0, failed: [] };
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const at = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const email = at(idx.email);
    const deptName = at(idx.department);
    const raw: Record<string, unknown> = {
      email,
      firstName: at(idx.firstName),
      lastName: at(idx.lastName),
    };
    if (at(idx.designation)) raw.designation = at(idx.designation);
    if (at(idx.orgRole)) raw.orgRole = at(idx.orgRole);
    if (at(idx.employmentType)) raw.employmentType = at(idx.employmentType);
    if (deptName) {
      const deptId = deptByName.get(deptName.toLowerCase());
      if (deptId) raw.departmentId = deptId; // unknown department names are ignored
    }
    const parsed = createEmployeeSchema.safeParse(raw);
    if (!parsed.success) {
      result.failed.push({ line: r + 1, email, error: parsed.error.issues[0]?.message ?? 'Invalid row' });
      continue;
    }
    try {
      await createEmployee(actor, parsed.data);
      result.created++;
    } catch (err) {
      result.failed.push({ line: r + 1, email, error: err instanceof Error ? err.message : 'Failed' });
    }
  }
  await recordAudit({
    action: 'employee.import',
    actorId: actor.id,
    actorLabel: actor.email,
    meta: { created: result.created, failed: result.failed.length },
  });
  return result;
}
