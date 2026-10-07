import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { LeaveType } from '../src/modules/leaves/leaveType.model';
import { applyLeave, listRequests, decideRequest, forwardRequest } from '../src/modules/leaves/leaves.service';
import { createRegularization, listRegularizations, decideRegularization, forwardRegularization } from '../src/modules/attendance/attendance.service';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';
import type { AccountType, OrgRole } from '@ems/types';

let mongod: MongoMemoryServer;
const actor: Record<string, AuthUser> = {};
const uid: Record<string, string> = {};
let typeId: string;

async function makeUser(key: string, accountType: AccountType, orgRole: OrgRole, profile: Record<string, unknown> = {}) {
  const u = await User.create({ email: `${key}@rt.test`, passwordHash: await hashPassword('Passw0rd!'), accountType, orgRole, status: 'Active' });
  actor[key] = { id: String(u._id), email: u.email, accountType, orgRole };
  uid[key] = String(u._id);
  await EmployeeProfile.create({ userId: u._id, firstName: key, lastName: 'T', status: 'Active', joiningDate: new Date('2020-01-01'), ...profile });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await makeUser('manager', 'Employee', 'Manager');
  await makeUser('ops', 'Employee', 'Operations');
  await makeUser('outsider', 'Employee', 'Member');
  await makeUser('owner', 'Owner', 'Admin');
  // Employee reports to the manager (so the manager's scope covers them).
  await makeUser('emp', 'Employee', 'Member', { reportsToId: new mongoose.Types.ObjectId(uid.manager) });
  const t = await LeaveType.create({ name: 'Annual', code: 'ANNUAL', defaultQuota: 20, paid: true, requiresApproval: true, active: true });
  typeId = String(t._id);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const titlesFor = (list: { id: string }[], id: string) => list.some((x) => x.id === id);

describe('leave: manager → forward to Operations/Admin', () => {
  it('submits to the manager stage, who can forward to Operations', async () => {
    const req = await applyLeave(uid.emp, { typeId, startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Family trip' });
    expect(req.status).toBe('Pending');
    expect(req.routedTo).toEqual([]);

    // Manager sees it; Operations does NOT (not forwarded yet); outsider does not.
    expect(titlesFor(await listRequests(actor.manager, 'pending'), req.id)).toBe(true);
    expect(titlesFor(await listRequests(actor.ops, 'pending'), req.id)).toBe(false);
    expect(titlesFor(await listRequests(actor.outsider, 'pending'), req.id)).toBe(false);

    // Operations cannot decide a manager-stage request; nor can the owner/admin.
    await expect(decideRequest(actor.ops, req.id, true)).rejects.toThrow();
    await expect(decideRequest(actor.owner, req.id, true)).rejects.toThrow();

    const fwd = await forwardRequest(actor.manager, req.id, {});
    expect(fwd.status).toBe('Pending');
    expect(fwd.routedTo).toEqual(['Operations']); // manager forwards only to Operations

    // Now Operations sees it and the manager no longer does.
    expect(titlesFor(await listRequests(actor.ops, 'pending'), req.id)).toBe(true);
    expect(titlesFor(await listRequests(actor.manager, 'pending'), req.id)).toBe(false);

    const decided = await decideRequest(actor.ops, req.id, true);
    expect(decided.status).toBe('Approved');
  });

  it('lets a manager approve directly; Operations escalates to Admin', async () => {
    const a = await applyLeave(uid.emp, { typeId, startDate: '2026-12-07', endDate: '2026-12-08', reason: 'Personal' });
    expect((await decideRequest(actor.manager, a.id, true)).status).toBe('Approved');

    const b = await applyLeave(uid.emp, { typeId, startDate: '2027-01-11', endDate: '2027-01-12', reason: 'Errand' });
    expect((await forwardRequest(actor.manager, b.id, {})).routedTo).toEqual(['Operations']);
    // The admin/owner cannot act while it sits at Operations.
    await expect(decideRequest(actor.owner, b.id, false)).rejects.toThrow();
    // Operations escalates to Admin; now the owner (Admin queue) decides.
    expect((await forwardRequest(actor.ops, b.id, {})).routedTo).toEqual(['Admin']);
    expect(titlesFor(await listRequests(actor.owner, 'pending'), b.id)).toBe(true);
    expect((await decideRequest(actor.owner, b.id, false)).status).toBe('Rejected');
  });

  it('blocks an outsider and self-forward', async () => {
    const a = await applyLeave(uid.emp, { typeId, startDate: '2027-02-01', endDate: '2027-02-02', reason: 'x' });
    await expect(decideRequest(actor.outsider, a.id, true)).rejects.toThrow();
    await expect(forwardRequest(actor.emp, a.id, {})).rejects.toThrow();
  });
});

describe('attendance regularization: direct to Operations, fallback to manager', () => {
  const regInput = (date: string) => ({ date, checkInAt: new Date(`${date}T09:00:00.000Z`), checkOutAt: new Date(`${date}T17:00:00.000Z`), reason: 'Forgot to punch', kind: 'Correction' as const });

  it('routes to Operations when an Operations user exists', async () => {
    const r = await createRegularization(uid.emp, regInput('2026-11-10'));
    expect(r.routedTo).toEqual(['Operations']);

    // Operations sees it; the manager does not (it went straight to Ops).
    expect(titlesFor(await listRegularizations(actor.ops, 'pending'), r.id)).toBe(true);
    expect(titlesFor(await listRegularizations(actor.manager, 'pending'), r.id)).toBe(false);

    const decided = await decideRegularization(actor.ops, r.id, true);
    expect(decided.status).toBe('Approved');
  });

  it('lets Operations escalate a regularization to Admin', async () => {
    const r = await createRegularization(uid.emp, regInput('2026-11-12'));
    expect(r.routedTo).toEqual(['Operations']);
    // Admin cannot act while it is at Operations.
    await expect(decideRegularization(actor.owner, r.id, true)).rejects.toThrow();
    const fwd = await forwardRegularization(actor.ops, r.id);
    expect(fwd.routedTo).toEqual(['Admin']);
    expect(titlesFor(await listRegularizations(actor.owner, 'pending'), r.id)).toBe(true);
    expect((await decideRegularization(actor.owner, r.id, true)).status).toBe('Approved');
  });

  it('falls back to the manager when no Operations user is active', async () => {
    await User.updateOne({ _id: uid.ops }, { $set: { status: 'Inactive' } });
    try {
      const r = await createRegularization(uid.emp, regInput('2026-11-11'));
      expect(r.routedTo).toEqual([]);
      expect(titlesFor(await listRegularizations(actor.manager, 'pending'), r.id)).toBe(true);
      const decided = await decideRegularization(actor.manager, r.id, true);
      expect(decided.status).toBe('Approved');
    } finally {
      await User.updateOne({ _id: uid.ops }, { $set: { status: 'Active' } });
    }
  });
});
