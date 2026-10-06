import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { PayrollSettings, SalaryStructure, PayrollRun, Payslip } from '../src/modules/payroll/payroll.models';
import { runScheduledPayroll } from '../src/modules/payroll/payroll.service';
import { hashPassword } from '../src/modules/auth/password';

let mongod: MongoMemoryServer;

async function setAuto(enabled: boolean, day: number) {
  await PayrollSettings.updateOne(
    { key: 'active' },
    { $set: { key: 'active', currency: 'PKR', fiscalYearStartMonth: 7, taxYearLabel: '2026', autoRunEnabled: enabled, payrollRunDay: day } },
    { upsert: true },
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const u = await User.create({ email: 'emp@pay.test', passwordHash: await hashPassword('Passw0rd!'), accountType: 'Employee', orgRole: 'Member', status: 'Active' });
  await EmployeeProfile.create({ userId: u._id, firstName: 'Pay', lastName: 'Roll', status: 'Active' });
  await SalaryStructure.create({ userId: u._id, annualSalary: 1_200_000, annualTax: 120_000 });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('scheduled auto-payroll', () => {
  it('does nothing when disabled', async () => {
    await setAuto(false, 10);
    const r = await runScheduledPayroll(new Date(2026, 9, 15)); // 15 Oct 2026
    expect(r.ran).toBe(false);
    expect(await PayrollRun.countDocuments({})).toBe(0);
  });

  it('does not run before the configured day', async () => {
    await setAuto(true, 10);
    const r = await runScheduledPayroll(new Date(2026, 10, 5)); // 5 Nov 2026, day 5 < 10
    expect(r.ran).toBe(false);
    expect(await PayrollRun.findOne({ month: '2026-11' })).toBeNull();
  });

  it('runs AND finalizes on/after the run day, producing a finalized payslip', async () => {
    await setAuto(true, 10);
    const r = await runScheduledPayroll(new Date(2026, 9, 15)); // 15 Oct 2026, day 15 >= 10
    expect(r.ran).toBe(true);
    expect(r.month).toBe('2026-10');
    expect(r.count).toBe(1);

    const run = await PayrollRun.findOne({ month: '2026-10' });
    expect(run?.status).toBe('Finalized');
    const slip = await Payslip.findOne({ month: '2026-10' });
    expect(slip?.status).toBe('Finalized');
    expect(slip?.grossMonthly).toBe(Math.round(1_200_000 / 12));
  });

  it('is idempotent — a second tick the same month does not re-run', async () => {
    const r = await runScheduledPayroll(new Date(2026, 9, 28)); // later in the same month
    expect(r.ran).toBe(false);
    expect(await PayrollRun.countDocuments({ month: '2026-10' })).toBe(1);
  });

  it('clamps the run day to the month length (e.g. day 31 in February)', async () => {
    await setAuto(true, 31);
    const r = await runScheduledPayroll(new Date(2026, 1, 28)); // 28 Feb 2026 (28-day month)
    expect(r.ran).toBe(true);
    expect(r.month).toBe('2026-02');
  });
});
