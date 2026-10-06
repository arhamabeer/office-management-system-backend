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
import { ComplaintCategory } from '../src/modules/complaints/complaintCategory.model';
import { Complaint } from '../src/modules/complaints/complaint.model';
import { InventoryCategory } from '../src/modules/inventoryRequests/inventoryCategory.model';
import { InventoryRequest } from '../src/modules/inventoryRequests/inventoryRequest.model';
import { CompanyProfile } from '../src/modules/businessCard/companyProfile.model';
import { LetterTemplate } from '../src/modules/letters/letterTemplate.model';
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

/** Base complaint configuration (categories). Editable on Complaints → Settings. */
async function seedComplaintConfig(): Promise<void> {
  const categories = [
    { name: 'Workplace', code: 'WORKPLACE' },
    { name: 'Facilities', code: 'FACILITIES' },
    { name: 'IT', code: 'IT' },
    { name: 'Payroll', code: 'PAYROLL' },
    { name: 'Other', code: 'OTHER' },
  ];
  for (const cat of categories) {
    await ComplaintCategory.updateOne(
      { code: cat.code },
      { $setOnInsert: { name: cat.name, code: cat.code, active: true } },
      { upsert: true },
    );
  }
  // Drop any non-canonical categories left from earlier seeds (e.g. Harassment).
  await ComplaintCategory.deleteMany({ code: { $nin: categories.map((c) => c.code) } });
}

/** Base inventory-request configuration (item categories). Editable on Inventory → Settings. */
async function seedInventoryConfig(): Promise<void> {
  const categories = [
    { name: 'Stationery', code: 'STATIONERY' },
    { name: 'IT Equipment', code: 'IT_EQUIP' },
    { name: 'Furniture', code: 'FURNITURE' },
    { name: 'Pantry', code: 'PANTRY' },
    { name: 'Other', code: 'OTHER' },
  ];
  for (const cat of categories) {
    await InventoryCategory.updateOne(
      { code: cat.code },
      { $setOnInsert: { name: cat.name, code: cat.code, active: true } },
      { upsert: true },
    );
  }
}

/** Company details shown on employee business cards. Editable on the card page (Admin). */
async function seedCompanyProfile(): Promise<void> {
  await CompanyProfile.updateOne(
    { key: 'default' },
    {
      $set: {
        companyName: 'BrainCrop',
        website: 'https://braincrop.io',
        email: 'info@braincrop.io',
        phone: '+92 21 111 2726 7627',
        address: 'Office 706, Ibrahim Trade Tower, Shahrah e Faisal, Block 7/8, Karachi 75350',
        tagline: 'Smart software for growing teams.',
      },
    },
    { upsert: true },
  );
}

/** Starter letter templates — generic, reusable; an admin fills in a recipient
 *  at download/email time. Idempotent (upsert by title). */
async function seedLetterTemplates(): Promise<void> {
  const templates = [
    {
      title: 'Experience Letter',
      subject: 'To Whom It May Concern',
      salutation: 'To Whom It May Concern,',
      body:
        'This is to certify that [Employee Name] was employed with [Company] as [Designation] from [Start Date] to [End Date].\n\n' +
        'During this tenure, [he/she/they] was found to be sincere, hardworking and professional in all assigned responsibilities.\n\n' +
        'We wish [him/her/them] all the best in [his/her/their] future endeavours.',
    },
    {
      title: 'Offer Letter',
      subject: 'Offer of Employment',
      salutation: 'Dear [Candidate Name],',
      body:
        'We are pleased to offer you the position of [Designation] at [Company]. Your expected date of joining is [Join Date].\n\n' +
        'Your gross monthly compensation will be [Amount], subject to the terms and policies of the company.\n\n' +
        'Please sign and return a copy of this letter as a token of your acceptance. We look forward to welcoming you to the team.',
    },
    {
      title: 'Employment / Salary Verification',
      subject: 'Employment & Salary Verification',
      salutation: 'To Whom It May Concern,',
      body:
        'This is to confirm that [Employee Name] is currently employed with [Company] as [Designation] since [Start Date].\n\n' +
        '[His/Her/Their] current gross monthly salary is [Amount]. This letter is issued upon request for [purpose].\n\n' +
        'Should you require any further information, please feel free to contact us.',
    },
    {
      title: 'No Objection Certificate',
      subject: 'No Objection Certificate',
      salutation: 'To Whom It May Concern,',
      body:
        'This is to certify that [Employee Name], holding the position of [Designation] at [Company], has no objection from the organisation for [purpose, e.g. applying for a visa].\n\n' +
        'This certificate is issued on [his/her/their] request and does not hold the company liable in any manner.',
    },
    {
      title: 'Warning Letter',
      subject: 'Written Warning',
      salutation: 'Dear [Employee Name],',
      body:
        'This letter serves as a formal warning regarding [describe the issue, e.g. repeated late arrivals] observed on [date(s)].\n\n' +
        'Such conduct is not in line with company policy and is expected to be corrected with immediate effect. Any recurrence may lead to further disciplinary action.\n\n' +
        'You are advised to treat this matter with the seriousness it deserves.',
    },
    {
      title: 'Appreciation Letter',
      subject: 'Letter of Appreciation',
      salutation: 'Dear [Employee Name],',
      body:
        'On behalf of [Company], I would like to express our sincere appreciation for your outstanding contribution to [project / achievement].\n\n' +
        'Your dedication and commitment have set a strong example for the team. Thank you for your continued hard work.\n\n' +
        'We look forward to your continued success with us.',
    },
  ];
  for (const t of templates) {
    await LetterTemplate.updateOne({ title: t.title }, { $set: t }, { upsert: true });
  }
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
    Complaint.deleteMany({}),
    InventoryRequest.deleteMany({}),
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
  await seedComplaintConfig();
  await seedInventoryConfig();
  await seedCompanyProfile();
  await seedLetterTemplates();

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
