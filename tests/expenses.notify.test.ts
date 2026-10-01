import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { ExpenseCategory } from '../src/modules/expenses/expenseCategory.model';
import { createClaim } from '../src/modules/expenses/expenses.service';
import { unreadCount } from '../src/modules/notifications/notification.service';
import { hashPassword } from '../src/modules/auth/password';

let mongod: MongoMemoryServer;
let submitterId: string;
let approverId: string;
let categoryId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const approver = await User.create({
    email: 'mgr@exp.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Employee',
    orgRole: 'Manager',
    status: 'Active',
  });
  approverId = String(approver._id);
  const submitter = await User.create({
    email: 'emp@exp.test',
    passwordHash: await hashPassword('Passw0rd!'),
    accountType: 'Employee',
    orgRole: 'Member',
    status: 'Active',
  });
  submitterId = String(submitter._id);
  await EmployeeProfile.create({
    userId: submitter._id,
    firstName: 'Emma',
    lastName: 'Ployee',
    status: 'Active',
    reportsToId: approver._id,
  });
  const cat = await ExpenseCategory.create({ name: 'Travel', code: 'TRV', requiresApproval: true, active: true });
  categoryId = String(cat._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('expense create-and-submit notifies the approver', () => {
  it('a default (submit omitted) createClaim notifies the manager', async () => {
    await createClaim(submitterId, {
      categoryId,
      amount: 500,
      incurredOn: '2026-09-30',
      description: 'Taxi to client site',
    });
    expect((await unreadCount(approverId)).unread).toBe(1);
  });

  it('saving a draft does NOT notify the approver', async () => {
    await createClaim(submitterId, {
      categoryId,
      amount: 300,
      incurredOn: '2026-09-30',
      description: 'Lunch (draft)',
      submit: false,
    });
    expect((await unreadCount(approverId)).unread).toBe(1); // unchanged
  });
});
