import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Patch zod with .openapi() metadata support (call once).
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
const bearer = [{ bearerAuth: [] as string[] }];

export const ErrorEnvelope = registry.register(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  }),
);

const HealthStatusSchema = registry.register(
  'HealthStatus',
  z.object({
    status: z.literal('ok'),
    uptimeSec: z.number(),
    timestamp: z.string(),
    db: z.enum(['connected', 'connecting', 'disconnected', 'unknown']),
    version: z.string(),
    env: z.string(),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Health / liveness probe',
  responses: {
    200: { description: 'Service is healthy', content: { 'application/json': { schema: z.object({ data: HealthStatusSchema }) } } },
  },
});

interface Flags {
  public?: boolean;
  body?: z.ZodTypeAny;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

function reg(method: Method, path: string, tag: string, summary: string, flags: Flags = {}): void {
  const paramNames = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const request: Record<string, unknown> = {};
  if (paramNames.length) {
    request.params = z.object(Object.fromEntries(paramNames.map((n) => [n, z.string()])));
  }
  if (flags.body) {
    request.body = { content: { 'application/json': { schema: flags.body } } };
  }
  registry.registerPath({
    method,
    path,
    tags: [tag],
    summary,
    security: flags.public ? [] : bearer,
    request: Object.keys(request).length ? request : undefined,
    responses: {
      200: { description: 'Success', content: { 'application/json': { schema: z.object({ data: z.unknown() }) } } },
      400: { description: 'Validation error', content: { 'application/json': { schema: ErrorEnvelope } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorEnvelope } } },
      403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorEnvelope } } },
    },
  });
}

const loginBody = z.object({ email: z.string().email(), password: z.string() }).openapi('LoginRequest');
const applyLeaveBody = z
  .object({ typeId: z.string(), startDate: z.string(), endDate: z.string(), reason: z.string() })
  .openapi('ApplyLeaveRequest');
const salaryBody = z
  .object({ annualSalary: z.number(), annualTax: z.number(), currency: z.string().optional() })
  .openapi('SetSalaryRequest');

// --- Auth (M1) ---
reg('post', '/auth/login', 'Auth', 'Log in (sets refresh cookie, returns access token)', { public: true, body: loginBody });
reg('post', '/auth/refresh', 'Auth', 'Rotate the refresh cookie and get a new access token', { public: true });
reg('post', '/auth/logout', 'Auth', 'Log out (revoke refresh token)', { public: true });
reg('get', '/auth/me', 'Auth', 'Current user + profile');
reg('post', '/auth/change-password', 'Auth', 'Change own password');
reg('post', '/auth/forgot-password', 'Auth', 'Request a password reset', { public: true });
reg('post', '/auth/reset-password', 'Auth', 'Reset password with a token', { public: true });
reg('get', '/auth/invite/{token}', 'Auth', 'Look up a pending invitation for onboarding', { public: true });
reg('post', '/auth/accept-invite', 'Auth', 'Accept an invite (set password + profile)', { public: true });

// --- Employees & Departments (M1) ---
reg('get', '/employees', 'Employees', 'List employees (role-scoped)');
reg('post', '/employees', 'Employees', 'Create / invite an employee (Admin/Owner)');
reg('post', '/employees/import', 'Employees', 'Bulk-import employees from CSV (Admin/Owner)');
reg('get', '/employees/{id}', 'Employees', 'Get an employee');
reg('patch', '/employees/{id}', 'Employees', 'Update an employee profile');
reg('patch', '/employees/{id}/role', 'Employees', 'Assign role (Owner-only for Admin/Owner)');
reg('delete', '/employees/{id}', 'Employees', 'Deactivate an employee (Admin/Owner)');
reg('post', '/employees/{id}/resend-invite', 'Employees', 'Resend / regenerate an onboarding invite (Admin/Owner)');
reg('get', '/departments', 'Departments', 'List departments');
reg('post', '/departments', 'Departments', 'Create a department (Admin/Owner)');
reg('patch', '/departments/{id}', 'Departments', 'Update a department (Admin/Owner)');
reg('delete', '/departments/{id}', 'Departments', 'Delete a department (Admin/Owner)');

// --- Attendance (M2) ---
reg('post', '/attendance/check-in', 'Attendance', 'Check in');
reg('post', '/attendance/check-out', 'Attendance', 'Check out');
reg('get', '/attendance/me', 'Attendance', 'My monthly records + summary');
reg('get', '/attendance/team', 'Attendance', 'Team attendance (role-scoped)');
reg('get', '/attendance/team/export', 'Attendance', 'Export team attendance CSV');
reg('get', '/attendance/roster', 'Attendance', "Today's roster incl. not-checked-in (Lead+)");
reg('get', '/attendance/report', 'Attendance', 'Period attendance report + top/lowest 3 (Lead+)');
reg('get', '/attendance/report/export', 'Attendance', 'Download the attendance report (PDF or Excel; Lead+)');
reg('get', '/attendance/person/{userId}/weeks', 'Attendance', 'Last-N-weeks breakdown for a person (scoped)');
reg('post', '/attendance', 'Attendance', 'Admin manual entry (Admin/Owner)');
reg('post', '/attendance/auto-absent/run', 'Attendance', 'Run the auto-absent sweep now (Admin/Owner)');
reg('get', '/attendance/policy', 'Attendance', 'Get attendance policy');
reg('put', '/attendance/policy', 'Attendance', 'Update attendance policy (Admin/Owner)');
reg('get', '/attendance/holidays', 'Attendance', 'List holidays');
reg('post', '/attendance/holidays', 'Attendance', 'Add a holiday (Admin/Owner)');
reg('delete', '/attendance/holidays/{id}', 'Attendance', 'Remove a holiday (Admin/Owner)');
reg('post', '/attendance/regularizations', 'Attendance', 'Raise a correction request');
reg('get', '/attendance/regularizations', 'Attendance', 'List regularizations (mine|pending)');
reg('patch', '/attendance/regularizations/{id}/approve', 'Attendance', 'Approve a correction');
reg('patch', '/attendance/regularizations/{id}/reject', 'Attendance', 'Reject a correction');

// --- Leaves (M3) ---
reg('get', '/leaves/types', 'Leaves', 'List leave types');
reg('post', '/leaves/types', 'Leaves', 'Create a leave type (Admin/Owner)');
reg('patch', '/leaves/types/{id}', 'Leaves', 'Update a leave type (Admin/Owner)');
reg('delete', '/leaves/types/{id}', 'Leaves', 'Deactivate a leave type (Admin/Owner)');
reg('get', '/leaves/policy', 'Leaves', 'Get leave policy');
reg('put', '/leaves/policy', 'Leaves', 'Update leave policy (Admin/Owner)');
reg('get', '/leaves/balance', 'Leaves', 'My leave balances');
reg('get', '/leaves/calendar', 'Leaves', 'Team leave calendar');
reg('post', '/leaves/requests', 'Leaves', 'Apply for leave', { body: applyLeaveBody });
reg('get', '/leaves/requests', 'Leaves', 'List leave requests (mine|pending|team)');
reg('get', '/leaves/requests/export', 'Leaves', 'Download leave requests as Excel (scoped)');
reg('patch', '/leaves/requests/{id}/cancel', 'Leaves', 'Cancel a leave request');
reg('patch', '/leaves/requests/{id}/approve', 'Leaves', 'Approve a leave request');
reg('patch', '/leaves/requests/{id}/reject', 'Leaves', 'Reject a leave request');

// --- Payroll (M4) ---
reg('get', '/payroll/settings', 'Payroll', 'Get payroll settings');
reg('put', '/payroll/settings', 'Payroll', 'Update payroll settings (Admin/Owner)');
reg('get', '/payroll/salaries', 'Payroll', 'All employees with their salaries (Admin/Owner)');
reg('get', '/payroll/salaries/export', 'Payroll', 'Download the salary table as Excel (Admin/Owner)');
reg('get', '/payroll/salary', 'Payroll', 'My salary (or ?userId= for Admin/Owner)');
reg('put', '/payroll/salary/{userId}', 'Payroll', 'Set a salary (annual salary + tax; Admin/Owner)', { body: salaryBody });
reg('get', '/payroll/runs', 'Payroll', 'List payroll runs (Admin/Owner)');
reg('post', '/payroll/runs', 'Payroll', 'Run payroll for a month (Admin/Owner)');
reg('post', '/payroll/runs/{id}/finalize', 'Payroll', 'Finalize a payroll run (Admin/Owner)');
reg('get', '/payroll/payslips', 'Payroll', 'My payslips (or ?userId= for Admin/Owner)');
reg('get', '/payroll/payslips/{id}', 'Payroll', 'Get a payslip');
reg('get', '/payroll/payslips/{id}/pdf', 'Payroll', 'Download a payslip PDF');
reg('get', '/payroll/tax/certificate', 'Payroll', 'My tax certificate');
reg('get', '/payroll/tax/certificate/pdf', 'Payroll', 'Download the tax certificate PDF');

// --- Teams ---
reg('get', '/teams', 'Teams', 'List teams (all for Admin/Owner; led/joined otherwise)');
reg('post', '/teams', 'Teams', 'Create a team (Admin/Owner/Manager)');
reg('get', '/teams/{id}', 'Teams', 'Get a team (lead/member or Admin/Owner)');
reg('patch', '/teams/{id}', 'Teams', 'Update a team name/description/leads (lead or Admin/Owner)');
reg('delete', '/teams/{id}', 'Teams', 'Delete a team (Admin/Owner)');
reg('post', '/teams/{id}/members', 'Teams', 'Add a member (lead or Admin/Owner)');
reg('delete', '/teams/{id}/members/{userId}', 'Teams', 'Remove a member (lead or Admin/Owner)');

// --- Notifications ---
reg('get', '/notifications', 'Notifications', 'List my notifications (recent, optionally unread)');
reg('get', '/notifications/count', 'Notifications', 'My unread notification count');
reg('get', '/notifications/preferences', 'Notifications', 'My notification delivery preferences');
reg('patch', '/notifications/preferences', 'Notifications', 'Update my notification preferences (email on/off)');
reg('post', '/notifications/read-all', 'Notifications', 'Mark all my notifications read');
reg('patch', '/notifications/{id}/read', 'Notifications', 'Mark one notification read');

// --- Announcements ---
reg('get', '/announcements', 'Announcements', 'List active announcements (everyone)');
reg('post', '/announcements', 'Announcements', 'Post an announcement (Admin/Owner)');
reg('post', '/announcements/read-all', 'Announcements', 'Mark all announcements read');
reg('patch', '/announcements/{id}', 'Announcements', 'Edit an announcement (Admin/Owner)');
reg('delete', '/announcements/{id}', 'Announcements', 'Delete an announcement (Admin/Owner)');
reg('post', '/announcements/{id}/read', 'Announcements', 'Mark one announcement read');

// --- Audit (M5) ---
reg('get', '/audit-logs', 'Audit', 'List audit-log entries (Admin/Owner)');

// --- Approvals (unified inbox badge count) ---
reg('get', '/approvals/count', 'Approvals', 'Count pending approvals in scope (Lead+)');

// --- Expenses ---
reg('get', '/expenses/categories', 'Expenses', 'List active expense categories');
reg('post', '/expenses/categories', 'Expenses', 'Create an expense category (Admin/Owner)');
reg('patch', '/expenses/categories/{id}', 'Expenses', 'Update an expense category (Admin/Owner)');
reg('delete', '/expenses/categories/{id}', 'Expenses', 'Deactivate an expense category (Admin/Owner)');
reg('get', '/expenses/policy', 'Expenses', 'Get expense policy');
reg('put', '/expenses/policy', 'Expenses', 'Update expense policy (Admin/Owner)');
reg('post', '/expenses/claims', 'Expenses', 'File an expense claim (draft or submit)');
reg('get', '/expenses/claims', 'Expenses', 'List expense claims (mine|pending|team)');
reg('get', '/expenses/claims/export', 'Expenses', 'Download expense claims as Excel (scoped)');
reg('patch', '/expenses/claims/{id}/submit', 'Expenses', 'Submit a draft claim');
reg('patch', '/expenses/claims/{id}/approve', 'Expenses', 'Approve a claim (Lead+, in scope)');
reg('patch', '/expenses/claims/{id}/reject', 'Expenses', 'Reject a claim (Lead+, in scope)');
reg('patch', '/expenses/claims/{id}/reimburse', 'Expenses', 'Mark a claim reimbursed (Admin/Owner)');

export function buildOpenApiDocument(prefix: string) {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'EMS API',
      version: process.env.npm_package_version ?? '0.0.0',
      description: 'Enterprise Employee Management System — REST API (BrainCrop).',
    },
    servers: [{ url: prefix }],
  });
}
