import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import {
  createAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
  approveAnnouncement,
  rejectAnnouncement,
  markAllRead,
} from '../src/modules/announcements/announcement.service';
import { unreadCount } from '../src/modules/notifications/notification.service';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';
import type { AccountType, OrgRole } from '@ems/types';

let mongod: MongoMemoryServer;
const actor: Record<string, AuthUser> = {};

async function makeUser(key: string, accountType: AccountType, orgRole: OrgRole) {
  const u = await User.create({
    email: `${key}@ann.test`,
    passwordHash: await hashPassword('Passw0rd!'),
    accountType,
    orgRole,
    status: 'Active',
  });
  actor[key] = { id: String(u._id), email: u.email, accountType, orgRole };
  await EmployeeProfile.create({ userId: u._id, firstName: key, lastName: 'T', status: 'Active' });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await makeUser('owner', 'Owner', 'Admin');
  await makeUser('member', 'Employee', 'Member');
  await makeUser('manager', 'Employee', 'Manager');
  await makeUser('ops', 'Employee', 'Operations');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('announcements', () => {
  it('lets an admin post (and fans out a bell notification) but refuses a member', async () => {
    const a = await createAnnouncement(actor.owner, { title: 'Welcome', body: 'Hello team' });
    expect(a.authorName).toBe('owner T');
    expect(a.readCount).toBe(0);
    // Everyone except the author gets a notification.
    expect((await unreadCount(actor.member.id)).unread).toBe(1);
    expect((await unreadCount(actor.owner.id)).unread).toBe(0);

    await expect(createAnnouncement(actor.member, { title: 'Nope', body: 'x' })).rejects.toThrow();
  });

  it('lists active announcements pinned-first and hides expired ones', async () => {
    await createAnnouncement(actor.owner, { title: 'Pinned one', body: 'b', pinned: true });
    await createAnnouncement(actor.owner, { title: 'Expired', body: 'b', expiresAt: new Date('2020-01-01') });

    const list = await listAnnouncements(actor.member);
    expect(list.find((x) => x.title === 'Expired')).toBeUndefined(); // expired hidden
    expect(list[0].title).toBe('Pinned one'); // pinned floats to top
  });

  it('tracks reads per user', async () => {
    const list = await listAnnouncements(actor.member);
    expect(list.every((x) => x.read === false)).toBe(true);

    const res = await markAllRead(actor.member);
    expect(res.updated).toBeGreaterThan(0);

    const after = await listAnnouncements(actor.member);
    expect(after.every((x) => x.read === true)).toBe(true);
    // The owner still hasn't read them.
    const ownerView = await listAnnouncements(actor.owner);
    expect(ownerView.some((x) => !x.read)).toBe(true);
    // readCount reflects the member's reads.
    expect(ownerView.find((x) => x.title === 'Welcome')!.readCount).toBe(1);
  });

  it('only admins edit/delete', async () => {
    const a = await createAnnouncement(actor.owner, { title: 'Temp', body: 'b' });
    await expect(updateAnnouncement(actor.member, a.id, { title: 'Hacked' })).rejects.toThrow();
    await expect(deleteAnnouncement(actor.member, a.id)).rejects.toThrow();
    const updated = await updateAnnouncement(actor.owner, a.id, { pinned: true });
    expect(updated.pinned).toBe(true);
    await deleteAnnouncement(actor.owner, a.id);
    expect((await listAnnouncements(actor.owner)).find((x) => x.id === a.id)).toBeUndefined();
  });
});

describe('announcement approval flow', () => {
  it('holds a manager submission as Pending until approved, hidden from staff', async () => {
    const sub = await createAnnouncement(actor.manager, { title: 'Team offsite', body: 'Planning an offsite.' });
    expect(sub.status).toBe('Pending');
    // A plain member does not see a pending notice; the author and Operations do.
    expect((await listAnnouncements(actor.member)).find((x) => x.title === 'Team offsite')).toBeUndefined();
    expect((await listAnnouncements(actor.manager)).find((x) => x.title === 'Team offsite')?.status).toBe('Pending');
    expect((await listAnnouncements(actor.ops)).find((x) => x.title === 'Team offsite')?.status).toBe('Pending');

    const approved = await approveAnnouncement(actor.ops, sub.id);
    expect(approved.status).toBe('Published');
    // Now everyone sees it.
    expect((await listAnnouncements(actor.member)).find((x) => x.title === 'Team offsite')?.status).toBe('Published');
  });

  it('lets operations reject a submission with a reason the author can see', async () => {
    const sub = await createAnnouncement(actor.manager, { title: 'Casual Friday', body: 'Proposal' });
    const rejected = await rejectAnnouncement(actor.ops, sub.id, 'Check with HR first');
    expect(rejected.status).toBe('Rejected');
    expect(rejected.decisionNote).toBe('Check with HR first');
    expect((await listAnnouncements(actor.manager)).find((x) => x.title === 'Casual Friday')?.decisionNote).toBe('Check with HR first');
    // Non-authors never see a rejected notice.
    expect((await listAnnouncements(actor.member)).find((x) => x.title === 'Casual Friday')).toBeUndefined();
  });

  it('forbids a manager from approving and a member from posting', async () => {
    const sub = await createAnnouncement(actor.manager, { title: 'Another', body: 'x' });
    await expect(approveAnnouncement(actor.manager, sub.id)).rejects.toThrow();
    await expect(createAnnouncement(actor.member, { title: 'No', body: 'x' })).rejects.toThrow();
  });
});
