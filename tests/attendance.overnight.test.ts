import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { AttendancePolicy } from '../src/modules/attendance/config.model';
import { checkIn, checkOut } from '../src/modules/attendance/attendance.service';
import { hashPassword } from '../src/modules/auth/password';

// Asia/Karachi is UTC+5: 18:00Z = 23:00 PKT on 2026-09-30; 21:00Z = 02:00 PKT
// on 2026-10-01 (the next calendar day).
const CHECK_IN = new Date('2026-09-30T18:00:00Z'); // 23:00 PKT, 2026-09-30
const CHECK_OUT = new Date('2026-09-30T21:00:00Z'); // 02:00 PKT, 2026-10-01

let mongod: MongoMemoryServer;
let uid: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CHECK_IN);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await AttendancePolicy.create({ key: 'default', timezone: 'Asia/Karachi', workdayMinutes: 480 });
  const u = await User.create({
    email: 'night@shift.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Employee',
    orgRole: 'Member',
    status: 'Active',
  });
  uid = String(u._id);
  await EmployeeProfile.create({ userId: u._id, firstName: 'Night', lastName: 'Owl', status: 'Active' });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  vi.useRealTimers();
});

describe('overnight-shift checkout', () => {
  it('closes yesterday’s still-open check-in when checking out after midnight', async () => {
    // Check in at 23:00 PKT on 2026-09-30.
    const inRec = await checkIn(uid, { source: 'SelfWeb' }, {});
    expect(inRec.date).toBe('2026-09-30');
    expect(inRec.checkOutAt).toBeUndefined();

    // Cross midnight: it is now 02:00 PKT on 2026-10-01.
    vi.setSystemTime(CHECK_OUT);
    const outRec = await checkOut(uid, {});

    // The record closed is still 2026-09-30's (where the shift began).
    expect(outRec.date).toBe('2026-09-30');
    expect(outRec.checkOutAt).toBeTruthy();
    expect(outRec.workedMinutes).toBe(180); // 23:00 -> 02:00 = 3h across midnight
    expect(outRec.status).toBe('HalfDay'); // 180 < 480

    // No stray record was created for 2026-10-01.
    expect(await Attendance.findOne({ userId: uid, date: '2026-10-01' })).toBeNull();
  });

  it('refuses a second checkout', async () => {
    await expect(checkOut(uid, {})).rejects.toThrow();
  });
});
