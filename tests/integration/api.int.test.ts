import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app';
import { User } from '../../src/modules/auth/user.model';
import { EmployeeProfile } from '../../src/modules/employees/employeeProfile.model';
import { ExpenseClaim } from '../../src/modules/expenses/expenseClaim.model';
import { hashPassword } from '../../src/modules/auth/password';

const app = createApp();
let mongod: MongoMemoryServer;
const PW = 'Passw0rd!';

async function makeUser(email: string, accountType: 'Owner' | 'Employee', orgRole: 'Admin' | 'Manager' | 'Lead' | 'Member', first: string) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(PW),
    accountType,
    orgRole,
    status: 'Active',
  });
  await EmployeeProfile.create({ userId: user._id, firstName: first, lastName: 'Test', status: 'Active' });
  return user;
}

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PW });
  return res.body.data.accessToken;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await makeUser('admin@int.test', 'Owner', 'Admin', 'Ada');
  await makeUser('member@int.test', 'Employee', 'Member', 'Mo');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('auth + RBAC (integration, real DB)', () => {
  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@int.test', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('logs in and returns the principal + a refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@int.test', password: PW });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.orgRole).toBe('Admin');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('ems_rt=') && /httponly/i.test(c))).toBe(true);
  });

  it('GET /auth/me returns the profile for a valid token', async () => {
    const token = await login('member@int.test');
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('member@int.test');
    expect(res.body.data.profile.fullName).toBe('Mo Test');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('scopes the employee directory (member sees only self)', async () => {
    const token = await login('member@int.test');
    const res = await request(app).get('/api/v1/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.meta.total).toBe(1);
    expect(res.body.data.items[0].email).toBe('member@int.test');
  });

  it('enforces RBAC on employee creation', async () => {
    const memberTok = await login('member@int.test');
    const denied = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ email: 'x@int.test', firstName: 'X', lastName: 'Y' });
    expect(denied.status).toBe(403);

    const adminTok = await login('admin@int.test');
    const created = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ email: 'newhire@int.test', firstName: 'New', lastName: 'Hire' });
    expect(created.status).toBe(201);
  });

  it('blocks salary access for non-self, non-admin', async () => {
    const memberTok = await login('member@int.test');
    const admin = await User.findOne({ email: 'admin@int.test' });
    const res = await request(app)
      .get(`/api/v1/payroll/salary?userId=${String(admin!._id)}`)
      .set('Authorization', `Bearer ${memberTok}`);
    expect(res.status).toBe(403);
  });

  it('blocks attendance team-view scope escape via ?userId (regression)', async () => {
    const memberTok = await login('member@int.test');
    const admin = await User.findOne({ email: 'admin@int.test' });
    const member = await User.findOne({ email: 'member@int.test' });

    // A member may not read another user's attendance by naming them.
    const denied = await request(app)
      .get(`/api/v1/attendance/team?userId=${String(admin!._id)}`)
      .set('Authorization', `Bearer ${memberTok}`);
    expect(denied.status).toBe(403);

    // The CSV export shares the same code path and must also be blocked.
    const deniedCsv = await request(app)
      .get(`/api/v1/attendance/team/export?userId=${String(admin!._id)}`)
      .set('Authorization', `Bearer ${memberTok}`);
    expect(deniedCsv.status).toBe(403);

    // Filtering to their own id stays allowed.
    const allowed = await request(app)
      .get(`/api/v1/attendance/team?userId=${String(member!._id)}`)
      .set('Authorization', `Bearer ${memberTok}`);
    expect(allowed.status).toBe(200);
  });
});

describe('expenses (integration, real DB)', () => {
  let categoryId: string;

  it('only Admin/Owner can create an expense category', async () => {
    const memberTok = await login('member@int.test');
    const denied = await request(app)
      .post('/api/v1/expenses/categories')
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ name: 'Travel', code: 'TRAVEL' });
    expect(denied.status).toBe(403);

    const adminTok = await login('admin@int.test');
    const created = await request(app)
      .post('/api/v1/expenses/categories')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ name: 'Travel', code: 'TRAVEL' });
    expect(created.status).toBe(201);
    categoryId = created.body.data.id;
  });

  it('a member files a claim for themselves and sees only their own', async () => {
    const memberTok = await login('member@int.test');
    const filed = await request(app)
      .post('/api/v1/expenses/claims')
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ categoryId, amount: 3000, incurredOn: '2026-01-15', description: 'Taxi to client' });
    expect(filed.status).toBe(201);
    expect(filed.body.data.status).toBe('Submitted');

    const member = await User.findOne({ email: 'member@int.test' });
    const mine = await request(app)
      .get('/api/v1/expenses/claims?scope=mine')
      .set('Authorization', `Bearer ${memberTok}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].userId).toBe(String(member!._id));
  });

  it('rejects a future-dated claim', async () => {
    const memberTok = await login('member@int.test');
    const res = await request(app)
      .post('/api/v1/expenses/claims')
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ categoryId, amount: 100, incurredOn: '2999-01-01', description: 'Time machine' });
    expect(res.status).toBe(400);
  });

  it('a member cannot approve claims (Lead+ gate), and reimburse is Admin-only', async () => {
    const claim = await ExpenseClaim.findOne({});
    const id = String(claim!._id);

    const memberTok = await login('member@int.test');
    const deniedApprove = await request(app)
      .patch(`/api/v1/expenses/claims/${id}/approve`)
      .set('Authorization', `Bearer ${memberTok}`)
      .send({});
    expect(deniedApprove.status).toBe(403);

    const adminTok = await login('admin@int.test');
    const approved = await request(app)
      .patch(`/api/v1/expenses/claims/${id}/approve`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('Approved');

    const deniedReimburse = await request(app)
      .patch(`/api/v1/expenses/claims/${id}/reimburse`)
      .set('Authorization', `Bearer ${memberTok}`)
      .send({});
    expect(deniedReimburse.status).toBe(403);

    const reimbursed = await request(app)
      .patch(`/api/v1/expenses/claims/${id}/reimburse`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({});
    expect(reimbursed.status).toBe(200);
    expect(reimbursed.body.data.status).toBe('Reimbursed');
  });
});
