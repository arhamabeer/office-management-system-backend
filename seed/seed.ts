import mongoose, { Types } from 'mongoose';
import { DEFAULT_FEATURE_FLAGS } from '@ems/config';
import { connectDb, disconnectDb } from '../src/config/db';
import { FeatureFlag } from '../src/models/FeatureFlag';
import { AppConfig } from '../src/models/AppConfig';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { Department } from '../src/modules/departments/department.model';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { AttendancePolicy, Holiday } from '../src/modules/attendance/config.model';
import { Regularization } from '../src/modules/attendance/regularization.model';
import { LeaveType } from '../src/modules/leaves/leaveType.model';
import { LeavePolicy } from '../src/modules/leaves/leavePolicy.model';
import { LeaveRequest } from '../src/modules/leaves/leaveRequest.model';
import { LeaveLedger } from '../src/modules/leaves/leaveLedger.model';
import { SalaryStructure, Payslip, PayrollRun } from '../src/modules/payroll/payroll.models';
import { ExpenseCategory } from '../src/modules/expenses/expenseCategory.model';
import { ExpensePolicy } from '../src/modules/expenses/expensePolicy.model';
import { ExpenseClaim } from '../src/modules/expenses/expenseClaim.model';
import { getSettingsDoc } from '../src/modules/payroll/payroll.service';
import { hashPassword } from '../src/modules/auth/password';
import { logger } from '../src/common/logger';

/**
 * Demo password for the seeded Owner. Local demo only — see backend/README.md.
 * Never use in production.
 */
const DEMO_PASSWORD = 'Passw0rd!';

/**
 * The single Owner account. Every other user is created by hand during testing
 * (invited from the Employees page), so the seed leaves the org otherwise empty.
 */
const OWNER = {
  email: 'owner@braincrop.io',
  firstName: 'Muhammed',
  lastName: 'Fahad',
  designation: 'Founder & CEO',
  employeeCode: 'BC-0001',
  joiningDate: new Date('2021-01-04'),
};

async function upsertDepartment(
  name: string,
  code: string,
  parent?: { _id: Types.ObjectId; ancestors: Types.ObjectId[] },
) {
  const ancestors = parent ? [...parent.ancestors, parent._id] : [];
  await Department.updateOne(
    { name },
    { $set: { code, parentId: parent?._id, ancestors } },
    { upsert: true },
  );
  const dept = await Department.findOne({ name });
  return dept!;
}

/** Base leave configuration (types + policy). Editable in-app on the Leaves → Settings tab. */
async function seedLeaveConfig(): Promise<void> {
  const types = [
    { name: 'Annual Leave', code: 'AL', defaultQuota: 20, paid: true },
    { name: 'Sick Leave', code: 'SICK', defaultQuota: 10, paid: true },
    { name: 'Casual Leave', code: 'CL', defaultQuota: 5, paid: true },
    { name: 'Unpaid Leave', code: 'UNPAID', defaultQuota: 0, paid: false },
  ];
  for (const t of types) {
    await LeaveType.updateOne(
      { code: t.code },
      { $setOnInsert: { ...t, requiresApproval: true, active: true } },
      { upsert: true },
    );
  }
  await LeavePolicy.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });
  // Drop any non-canonical leave types left over from testing.
  await LeaveType.deleteMany({ code: { $nin: ['AL', 'SICK', 'CL', 'UNPAID'] } });
}

/** Base expense configuration (categories + policy). Editable on the Expenses → Settings tab. */
async function seedExpenseConfig(): Promise<void> {
  const categories = [
    { name: 'Travel', code: 'TRAVEL' },
    { name: 'Meals', code: 'MEALS' },
    { name: 'Supplies', code: 'SUPPLIES' },
    { name: 'Other', code: 'OTHER' },
  ];
  for (const cat of categories) {
    await ExpenseCategory.updateOne(
      { code: cat.code },
      { $setOnInsert: { name: cat.name, code: cat.code, perClaimLimit: 0, requiresApproval: true, active: true } },
      { upsert: true },
    );
  }
  await ExpensePolicy.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });
}

async function seed(): Promise<void> {
  await connectDb();
  if (mongoose.connection.readyState !== 1) {
    logger.error('No database connection — set MONGODB_URI and ensure MongoDB is reachable.');
    process.exit(1);
  }

  // --- Wipe all per-user + transactional data (clean slate for testing) ---
  await Promise.all([
    Attendance.deleteMany({}),
    Regularization.deleteMany({}),
    Holiday.deleteMany({}),
    LeaveRequest.deleteMany({}),
    LeaveLedger.deleteMany({}),
    Payslip.deleteMany({}),
    PayrollRun.deleteMany({}),
    SalaryStructure.deleteMany({}),
    ExpenseClaim.deleteMany({}),
  ]);
  // Drop the pre-rename tax config collection if it still exists (best effort).
  await mongoose.connection.db?.dropCollection('taxconfigs').catch(() => undefined);

  // --- Feature flags + org profile ---
  for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    await FeatureFlag.updateOne({ key }, { $setOnInsert: { key, enabled } }, { upsert: true });
  }
  await AppConfig.updateOne(
    { key: 'org.profile' },
    { $setOnInsert: { key: 'org.profile', value: { name: 'BrainCrop', singleTenant: true } } },
    { upsert: true },
  );

  // --- Base configuration (defaults the Owner can edit) ---
  await AttendancePolicy.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });
  await getSettingsDoc(); // payroll settings (PKR, July fiscal year)
  await seedLeaveConfig();
  await seedExpenseConfig();

  // --- Departments (org scaffolding for assigning new hires; no managers yet) ---
  const engineering = await upsertDepartment('Engineering', 'ENG');
  await upsertDepartment('Platform', 'ENG-PLT', {
    _id: engineering._id,
    ancestors: engineering.ancestors ?? [],
  });
  await upsertDepartment('People Operations', 'HR');
  await upsertDepartment('Finance', 'FIN');
  await upsertDepartment('Sales', 'SAL');
  // The Owner assigns managers/leads as they invite people, so clear any refs
  // left over from a previous seed.
  await Department.updateMany({}, { $unset: { managerId: '', leadId: '' } });

  // --- The single Owner ---
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await User.updateOne(
    { email: OWNER.email },
    { $set: { email: OWNER.email, passwordHash, accountType: 'Owner', orgRole: 'Admin', status: 'Active' } },
    { upsert: true },
  );
  const owner = await User.findOne({ email: OWNER.email });

  // Remove every OTHER user (all demo personas + any test hires) and their profiles.
  await Promise.all([
    User.deleteMany({ _id: { $ne: owner!._id } }),
    EmployeeProfile.deleteMany({ userId: { $ne: owner!._id } }),
  ]);

  await EmployeeProfile.updateOne(
    { userId: owner!._id },
    {
      $set: {
        userId: owner!._id,
        employeeCode: OWNER.employeeCode,
        firstName: OWNER.firstName,
        lastName: OWNER.lastName,
        designation: OWNER.designation,
        employmentType: 'FullTime',
        joiningDate: OWNER.joiningDate,
        status: 'Active',
      },
    },
    { upsert: true },
  );

  const userCount = await User.countDocuments();
  logger.info(
    { users: userCount },
    `Seed complete. Single Owner "${OWNER.firstName} ${OWNER.lastName}" <${OWNER.email}> · password "${DEMO_PASSWORD}". Add all other users from the Employees page.`,
  );

  await disconnectDb();
  process.exit(0);
}

void seed();
