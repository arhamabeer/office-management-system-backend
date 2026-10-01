import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { LeaveType } from '../src/modules/leaves/leaveType.model';
import { LeavePolicy } from '../src/modules/leaves/leavePolicy.model';
import { LeaveRequest } from '../src/modules/leaves/leaveRequest.model';
import { LeaveLedger } from '../src/modules/leaves/leaveLedger.model';
import { applyLeave, cancelRequest } from '../src/modules/leaves/leaves.service';
import { leaveYearOf } from '../src/modules/leaves/leaves.util';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';

let mongod: MongoMemoryServer;
let uid: string;
let typeId: string;
const YEAR = leaveYearOf('2026-03-02');

// Two non-overlapping 3-working-day ranges against a 5-day quota: together they
// exceed the allowance, so at most one may be granted no matter how they race.
const RANGE_A = { startDate: '2026-03-02', endDate: '2026-03-04', reason: 'Trip A' };
const RANGE_B = { startDate: '2026-03-09', endDate: '2026-03-11', reason: 'Trip B' };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // The unique {userId,typeId,year} index IS the concurrency primitive — build
  // it before the race so a duplicate ledger row can't be inserted.
  await LeaveLedger.init();
  // Seed the singleton policy up front (as the real app does) so the race under
  // test is purely the quota gate, not the policy-init path.
  await LeavePolicy.init();
  await LeavePolicy.create({ key: 'default' });

  const user = await User.create({
    email: 'racer@int.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Employee',
    orgRole: 'Member',
    status: 'Active',
  });
  uid = String(user._id);
  // No joiningDate -> not within probation, so paid leave is allowed.
  await EmployeeProfile.create({ userId: user._id, firstName: 'Ray', lastName: 'Cer', status: 'Active' });
  const type = await LeaveType.create({
    name: 'Annual',
    code: 'AL',
    defaultQuota: 5,
    paid: true,
    requiresApproval: true,
    active: true,
  });
  typeId = String(type._id);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('leave apply — quota concurrency (atomic ledger guard)', () => {
  it('lets only one of two racing applications reserve against an insufficient quota', async () => {
    const results = await Promise.allSettled([
      applyLeave(uid, { typeId, ...RANGE_A }),
      applyLeave(uid, { typeId, ...RANGE_B }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // Exactly one wins, regardless of interleaving.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason?.message ?? rejected[0].reason)).toMatch(/Insufficient/i);

    // The ledger reflects a single 3-day reservation, never 6.
    const ledger = await LeaveLedger.findOne({ userId: uid, typeId, year: YEAR });
    expect(ledger?.reserved).toBe(3);

    // Exactly one Pending request persisted.
    const pending = await LeaveRequest.countDocuments({ userId: uid, status: 'Pending' });
    expect(pending).toBe(1);
  });

  it('releases the reservation when the request is cancelled', async () => {
    const req = await LeaveRequest.findOne({ userId: uid, status: 'Pending' });
    expect(req).toBeTruthy();

    const actor = { id: uid, email: 'racer@int.test', accountType: 'Employee', orgRole: 'Member' } as AuthUser;
    await cancelRequest(actor, String(req!._id));

    const ledger = await LeaveLedger.findOne({ userId: uid, typeId, year: YEAR });
    expect(ledger?.reserved).toBe(0);

    // The freed quota now admits a fresh 3-day application.
    const fresh = await applyLeave(uid, { typeId, ...RANGE_A });
    expect(fresh.status).toBe('Pending');
    const after = await LeaveLedger.findOne({ userId: uid, typeId, year: YEAR });
    expect(after?.reserved).toBe(3);
  });
});
