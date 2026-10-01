import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { Team } from '../src/modules/teams/team.model';
import {
  createTeam,
  addMember,
  removeMember,
  deleteTeam,
  listTeams,
} from '../src/modules/teams/team.service';
import { scopedUserIds } from '../src/common/scope';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';
import type { AccountType, OrgRole } from '@ems/types';

let mongod: MongoMemoryServer;
const actor: Record<string, AuthUser> = {};
const uid: Record<string, string> = {};

async function makeUser(key: string, accountType: AccountType, orgRole: OrgRole) {
  const u = await User.create({
    email: `${key}@team.test`,
    passwordHash: await hashPassword('Passw0rd!'),
    accountType,
    orgRole,
    status: 'Active',
  });
  uid[key] = String(u._id);
  actor[key] = { id: String(u._id), email: u.email, accountType, orgRole };
  await EmployeeProfile.create({ userId: u._id, firstName: key, lastName: 'T', status: 'Active' });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await makeUser('owner', 'Owner', 'Admin');
  await makeUser('manager', 'Employee', 'Manager');
  await makeUser('lead', 'Employee', 'Lead');
  await makeUser('m1', 'Employee', 'Member');
  await makeUser('m2', 'Employee', 'Member');
  await makeUser('outsider', 'Employee', 'Member');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('teams — permissions', () => {
  it('lets a Manager create a team (creator becomes a lead) but refuses a Member', async () => {
    const team = await createTeam(actor.manager, { name: 'Alpha', memberIds: [uid.m1] });
    expect(team.leads.map((l) => l.userId)).toContain(uid.manager);
    expect(team.members.map((m) => m.userId)).toEqual([uid.m1]);
    expect(team.canManage).toBe(true);

    await expect(createTeam(actor.m1, { name: 'Nope' })).rejects.toThrow();
  });

  it('validates referenced users exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(createTeam(actor.owner, { name: 'Bad', memberIds: [fakeId] })).rejects.toThrow();
  });
});

describe('teams — membership + scope augmentation', () => {
  it('a team lead sees team members in scope; co-members do not gain scope', async () => {
    // Owner creates a team led by `lead`, with m1 & m2 as members.
    const team = await createTeam(actor.owner, {
      name: 'Bravo',
      leadIds: [uid.lead],
      memberIds: [uid.m1, uid.m2],
    });

    // The lead (no reporting lines) now sees m1 & m2 via the team union.
    const leadScope = await scopedUserIds(actor.lead);
    expect(leadScope.orgWide).toBe(false);
    const leadIds = leadScope.ids.map(String);
    expect(leadIds).toContain(uid.m1);
    expect(leadIds).toContain(uid.m2);
    expect(leadIds).not.toContain(uid.outsider);

    // A plain member of the team gains NO extra scope (only self).
    const m1Scope = await scopedUserIds(actor.m1);
    expect(m1Scope.ids.map(String)).toEqual([uid.m1]);

    // A team lead may add/remove members; a non-lead member may not.
    const withOutsider = await addMember(actor.lead, team.id, uid.outsider);
    expect(withOutsider.members.map((m) => m.userId)).toContain(uid.outsider);
    await expect(addMember(actor.m1, team.id, uid.manager)).rejects.toThrow();

    const removed = await removeMember(actor.lead, team.id, uid.outsider);
    expect(removed.members.map((m) => m.userId)).not.toContain(uid.outsider);

    // Removing the outsider from the team also drops them from the lead's scope.
    const afterRemove = await scopedUserIds(actor.lead);
    expect(afterRemove.ids.map(String)).not.toContain(uid.outsider);
  });

  it('keeps owners/admins out of a team lead\'s scope even if added as members', async () => {
    // A team led by `lead` that also contains the owner (Owner/Admin) as a member.
    await createTeam(actor.owner, {
      name: 'Delta',
      leadIds: [uid.lead],
      memberIds: [uid.owner, uid.m1],
    });
    const scope = await scopedUserIds(actor.lead);
    const ids = scope.ids.map(String);
    expect(ids).toContain(uid.m1); // a regular member is visible
    expect(ids).not.toContain(uid.owner); // the owner/admin is not
  });

  it('only owner/admin can delete a team; listing is scoped', async () => {
    const team = await createTeam(actor.owner, { name: 'Charlie', memberIds: [uid.m2] });
    await expect(deleteTeam(actor.m2, team.id)).rejects.toThrow();

    // Owner sees every team; a member sees only teams they belong to.
    const ownerList = await listTeams(actor.owner);
    expect(ownerList.length).toBeGreaterThanOrEqual(3);
    const outsiderList = await listTeams(actor.outsider);
    expect(outsiderList.every((t) => t.canManage === false)).toBe(true);

    await deleteTeam(actor.owner, team.id);
    expect(await Team.findById(team.id)).toBeNull();
  });
});
