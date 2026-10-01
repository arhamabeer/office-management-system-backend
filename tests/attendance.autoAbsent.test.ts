import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { LeaveType } from '../src/modules/leaves/leaveType.model';
import { LeaveRequest } from '../src/modules/leaves/leaveRequest.model';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { AttendancePolicy } from '../src/modules/attendance/config.model';
import { runAutoAbsent, getRoster, checkIn } from '../src/modules/attendance/attendance.service';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';

// A fixed working Wednesday, 14:00 in Asia/Karachi (09:00Z) — after the 13:00
// cut-off — so the sweep runs deterministically regardless of the real date.
const NOW = new Date('2026-09-30T09:00:00Z');
const DATE = '2026-09-30';

let mongod: MongoMemoryServer;
let owner: AuthUser;
const id: Record<string, string> = {};

async function makeUser(key: string, orgRole: 'Admin' | 'Member', extra: Record<string, unknown> = {}) {
  const u = await User.create({
    email: `${key}@int.test`,
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: orgRole === 'Admin' ? 'Owner' : 'Employee',
    orgRole,
    status: 'Active',
  });
  id[key] = String(u._id);
  await EmployeeProfile.create({
    userId: u._id,
    firstName: key,
    lastName: 'Test',
    status: 'Active',
    ...extra,
  });
  return u;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await AttendancePolicy.create({
    key: 'default',
    timezone: 'Asia/Karachi',
    autoAbsentEnabled: true,
    autoAbsentCutoff: '13:00',
    weekOff: [0, 6],
  });

  const ownerUser = await makeUser('owner', 'Admin');
  owner = { id: String(ownerUser._id), email: ownerUser.email, accountType: 'Owner', orgRole: 'Admin' };
  await makeUser('mgr', 'Member');
  await makeUser('nocheckin', 'Member', { reportsToId: new mongoose.Types.ObjectId(id.mgr) });
  await makeUser('checkedin', 'Member');
  await makeUser('onleave', 'Member');
  await makeUser('prejoiner', 'Member', { joiningDate: new Date('2027-01-01') });

  // "checkedin" already punched in today.
  await Attendance.create({ userId: new mongoose.Types.ObjectId(id.checkedin), date: DATE, checkInAt: NOW, status: 'Present', source: 'SelfWeb' });
  // "onleave" has an approved leave covering today.
  const lt = await LeaveType.create({ name: 'Annual', code: 'AL', defaultQuota: 10, paid: true, requiresApproval: true, active: true });
  await LeaveRequest.create({
    userId: new mongoose.Types.ObjectId(id.onleave),
    typeId: lt._id,
    year: 2026,
    startDate: '2026-09-29',
    endDate: '2026-10-01',
    days: 3,
    reason: 'Vacation',
    status: 'Approved',
  });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  vi.useRealTimers();
});

describe('auto-absent sweep', () => {
  it('marks un-checked-in members absent (skips owners/admins, checked-in, on-leave, pre-joiners)', async () => {
    const res = await runAutoAbsent();
    expect(res.ran).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(res.date).toBe(DATE);
    // mgr and nocheckin are absent; owner (Owner/Admin) is exempt.
    expect(res.markedAbsent).toBe(2);
    // Each absentee is emailed; nocheckin's manager (mgr) gets a copy too.
    expect(res.notified).toBe(3);

    const nc = await Attendance.findOne({ userId: id.nocheckin, date: DATE });
    expect(nc?.status).toBe('Absent');
    expect(nc?.source).toBe('System');

    // Owner is exempt — no absent record created for them.
    expect(await Attendance.findOne({ userId: id.owner, date: DATE })).toBeNull();
    // Checked-in stays Present; on-leave and pre-joiner get no record.
    expect((await Attendance.findOne({ userId: id.checkedin, date: DATE }))?.status).toBe('Present');
    expect(await Attendance.findOne({ userId: id.onleave, date: DATE })).toBeNull();
    expect(await Attendance.findOne({ userId: id.prejoiner, date: DATE })).toBeNull();
  });

  it('is idempotent for the day', async () => {
    const res = await runAutoAbsent();
    expect(res.skipped).toBe('already-ran');
    expect(res.markedAbsent).toBe(0);
  });

  it('flips Absent to Present when the employee checks in later', async () => {
    const dto = await checkIn(id.nocheckin, { source: 'SelfWeb' }, {});
    expect(dto.status).toBe('Present');
    const nc = await Attendance.findOne({ userId: id.nocheckin, date: DATE });
    expect(nc?.status).toBe('Present');
    expect(nc?.checkInAt).toBeTruthy();
  });

  it('roster lists every expected employee with a derived status', async () => {
    const roster = await getRoster(owner, { date: DATE });
    expect(roster.nonWorking).toBe(false);
    // owner, mgr, nocheckin, checkedin, onleave — pre-joiner excluded.
    expect(roster.rows).toHaveLength(5);
    const byUser = new Map(roster.rows.map((r) => [r.userId, r.status]));
    expect(byUser.get(id.nocheckin)).toBe('Present'); // flipped by the later check-in
    expect(byUser.get(id.checkedin)).toBe('Present');
    expect(byUser.get(id.onleave)).toBe('OnLeave');
    expect(byUser.get(id.owner)).toBe('NotCheckedIn'); // exempt — never auto-marked
    expect(byUser.get(id.mgr)).toBe('Absent');
    expect(roster.counts.onLeave).toBe(1);
    expect(roster.counts.present).toBe(2); // nocheckin (flipped) + checkedin
    expect(roster.counts.absent).toBe(1); // mgr
    expect(roster.counts.notCheckedIn).toBe(1); // owner (exempt)
  });
});
