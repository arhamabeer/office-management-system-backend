import { Types } from 'mongoose';
import type { TeamDTO, TeamMemberDTO } from '@ems/types';
import type { CreateTeamInput, UpdateTeamInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { Team, type TeamDoc } from './team.model';
import { User } from '../auth/user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { recordAudit } from '../../middleware/audit';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';

const oid = (s: string): Types.ObjectId => new Types.ObjectId(s);

function dedupe(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    const k = String(id);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

const isOrgAdmin = (a: AuthUser): boolean => a.accountType === 'Owner' || a.orgRole === 'Admin';
const canCreate = (a: AuthUser): boolean => isOrgAdmin(a) || a.orgRole === 'Manager';
const leads = (t: TeamDoc): string[] => t.leadIds.map((l) => String(l));
const canManage = (a: AuthUser, t: TeamDoc): boolean => isOrgAdmin(a) || leads(t).includes(a.id);
const canView = (a: AuthUser, t: TeamDoc): boolean =>
  canManage(a, t) || t.memberIds.some((m) => String(m) === a.id);

/** Reject if any referenced id isn't a real user. */
async function assertUsersExist(ids: Types.ObjectId[]): Promise<void> {
  if (!ids.length) return;
  const found = await User.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new ValidationError('One or more selected users do not exist');
}

async function personMap(userIds: Types.ObjectId[]): Promise<Map<string, TeamMemberDTO>> {
  if (!userIds.length) return new Map();
  const [profiles, users] = await Promise.all([
    EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName designation'),
    User.find({ _id: { $in: userIds } }).select('email'),
  ]);
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));
  const map = new Map<string, TeamMemberDTO>();
  for (const p of profiles) {
    const k = String(p.userId);
    map.set(k, {
      userId: k,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: emailMap.get(k) ?? '',
      designation: p.designation ?? undefined,
    });
  }
  for (const u of users) {
    const k = String(u._id);
    if (!map.has(k)) map.set(k, { userId: k, name: '—', email: u.email, designation: undefined });
  }
  return map;
}

function toDTO(team: TeamDoc, pmap: Map<string, TeamMemberDTO>, actorCanManage: boolean): TeamDTO {
  const toMember = (id: Types.ObjectId): TeamMemberDTO =>
    pmap.get(String(id)) ?? { userId: String(id), name: '—', email: '', designation: undefined };
  return {
    id: String(team._id),
    name: team.name,
    description: team.description ?? undefined,
    leads: team.leadIds.map(toMember),
    members: team.memberIds.map(toMember),
    memberCount: team.memberIds.length,
    canManage: actorCanManage,
    createdAt: (team.createdAt as Date).toISOString(),
  };
}

async function hydrate(team: TeamDoc, actor: AuthUser): Promise<TeamDTO> {
  const pmap = await personMap(dedupe([...team.leadIds, ...team.memberIds]));
  return toDTO(team, pmap, canManage(actor, team));
}

/** Owner/Admin see all teams; everyone else sees teams they lead or belong to. */
export async function listTeams(actor: AuthUser): Promise<TeamDTO[]> {
  const filter = isOrgAdmin(actor)
    ? {}
    : { $or: [{ leadIds: oid(actor.id) }, { memberIds: oid(actor.id) }] };
  const teams = await Team.find(filter).sort({ name: 1 });
  const ids = dedupe(teams.flatMap((t) => [...t.leadIds, ...t.memberIds]));
  const pmap = await personMap(ids);
  return teams.map((t) => toDTO(t, pmap, canManage(actor, t)));
}

export async function createTeam(actor: AuthUser, input: CreateTeamInput): Promise<TeamDTO> {
  if (!canCreate(actor)) throw new ForbiddenError('You do not have permission to create teams');
  // The creator is always a lead so they can manage what they just made.
  const leadIds = dedupe([...(input.leadIds ?? []).map(oid), oid(actor.id)]);
  const memberIds = dedupe((input.memberIds ?? []).map(oid));
  await assertUsersExist(dedupe([...leadIds, ...memberIds]));
  const team = await Team.create({
    name: input.name,
    description: input.description,
    leadIds,
    memberIds,
    createdById: oid(actor.id),
  });
  await recordAudit({
    action: 'team.created',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Team',
    targetId: String(team._id),
    meta: { name: team.name, members: memberIds.length },
  });
  return hydrate(team, actor);
}

export async function getTeam(actor: AuthUser, id: string): Promise<TeamDTO> {
  const team = await Team.findById(id);
  if (!team) throw new NotFoundError('Team not found');
  if (!canView(actor, team)) throw new ForbiddenError('You do not have access to this team');
  return hydrate(team, actor);
}

export async function updateTeam(actor: AuthUser, id: string, input: UpdateTeamInput): Promise<TeamDTO> {
  const team = await Team.findById(id);
  if (!team) throw new NotFoundError('Team not found');
  if (!canManage(actor, team)) throw new ForbiddenError('You cannot manage this team');
  if (input.name !== undefined) team.name = input.name;
  if (input.description !== undefined) team.description = input.description ?? undefined;
  if (input.leadIds !== undefined) {
    const leadIds = dedupe(input.leadIds.map(oid));
    await assertUsersExist(leadIds);
    team.leadIds = leadIds;
  }
  await team.save();
  await recordAudit({
    action: 'team.updated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Team',
    targetId: String(team._id),
  });
  return hydrate(team, actor);
}

export async function addMember(actor: AuthUser, id: string, userId: string): Promise<TeamDTO> {
  const team = await Team.findById(id);
  if (!team) throw new NotFoundError('Team not found');
  if (!canManage(actor, team)) throw new ForbiddenError('You cannot manage this team');
  if (!(await User.exists({ _id: userId }))) throw new NotFoundError('User not found');
  if (!team.memberIds.some((m) => String(m) === userId)) {
    team.memberIds.push(oid(userId));
    await team.save();
    await recordAudit({
      action: 'team.member_added',
      actorId: actor.id,
      actorLabel: actor.email,
      targetType: 'Team',
      targetId: String(team._id),
      meta: { userId },
    });
  }
  return hydrate(team, actor);
}

export async function removeMember(actor: AuthUser, id: string, userId: string): Promise<TeamDTO> {
  const team = await Team.findById(id);
  if (!team) throw new NotFoundError('Team not found');
  if (!canManage(actor, team)) throw new ForbiddenError('You cannot manage this team');
  const before = team.memberIds.length;
  team.memberIds = team.memberIds.filter((m) => String(m) !== userId) as typeof team.memberIds;
  if (team.memberIds.length !== before) {
    await team.save();
    await recordAudit({
      action: 'team.member_removed',
      actorId: actor.id,
      actorLabel: actor.email,
      targetType: 'Team',
      targetId: String(team._id),
      meta: { userId },
    });
  }
  return hydrate(team, actor);
}

export async function deleteTeam(actor: AuthUser, id: string): Promise<void> {
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only an owner or admin can delete a team');
  const team = await Team.findById(id);
  if (!team) throw new NotFoundError('Team not found');
  await team.deleteOne();
  await recordAudit({
    action: 'team.deleted',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Team',
    targetId: id,
    meta: { name: team.name },
  });
}
