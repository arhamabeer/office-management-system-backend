import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { AttendancePolicy } from '../src/modules/attendance/config.model';
import { getAttendanceReport } from '../src/modules/attendance/attendance.service';
import { hashPassword } from '../src/modules/auth/password';
import type { AuthUser } from '../src/middleware/auth';

// Wed 2026-09-30, 14:00 PKT. Current week 09-28..10-04 is in-progress; the
// three prior Mon–Sun weeks in a '1m' (4-week) report are complete.
const NOW = new Date('2026-09-30T09:00:00Z');

let mongod: MongoMemoryServer;
let owner: AuthUser;
let empId: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await AttendancePolicy.create({ key: 'default', timezone: 'Asia/Karachi', weeklyMinimumMinutes: 2700 });

  const ownerUser = await User.create({
    email: 'owner@rep.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Owner',
    orgRole: 'Admin',
    status: 'Active',
  });
  owner = { id: String(ownerUser._id), email: ownerUser.email, accountType: 'Owner', orgRole: 'Admin' };
  await EmployeeProfile.create({ userId: ownerUser._id, firstName: 'Own', lastName: 'Er', status: 'Active' });

  const emp = await User.create({
    email: 'emp@rep.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Employee',
    orgRole: 'Member',
    status: 'Active',
  });
  empId = String(emp._id);
  await EmployeeProfile.create({
    userId: emp._id,
    firstName: 'Emp',
    lastName: 'Loyee',
    status: 'Active',
    joiningDate: new Date('2026-09-14'),
  });

  // A full 45h (2700m) in ONE completed week (Mon 09-14 .. Fri 09-18); the other
  // two completed weeks have no records (before joining / inactive).
  for (const day of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']) {
    await Attendance.create({ userId: emp._id, date: day, status: 'Present', workedMinutes: 540 });
  }
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  vi.useRealTimers();
});

describe('getAttendanceReport', () => {
  it('averages only over worked/expected weeks, not empty completed ones', async () => {
    const report = await getAttendanceReport(owner, { period: '1m' });
    const row = report.rows.find((r) => r.userId === empId);
    expect(row).toBeTruthy();
    expect(row!.totalWorkedMinutes).toBe(2700);
    // Average must reflect the single worked week (2700), not 2700/3 empty-diluted.
    expect(row!.avgWeeklyMinutes).toBe(2700);
    expect(row!.completedWeeks).toBe(1);
    expect(row!.daysPresent).toBe(5);
    expect(row!.shortWeeks).toBe(0); // exactly at the 2700 minimum
  });

  it('ranks by total hours and is scoped to Owner/Admin', async () => {
    const report = await getAttendanceReport(owner, { period: '1m' });
    expect(report.top[0].userId).toBe(empId); // most hours
    expect(report.rows.length).toBe(2); // owner + emp
    // An owner with no records averages 0, not a diluted/negative number.
    const ownerRow = report.rows.find((r) => r.userId === owner.id);
    expect(ownerRow!.avgWeeklyMinutes).toBe(0);
    expect(ownerRow!.completedWeeks).toBe(0);
  });
});
