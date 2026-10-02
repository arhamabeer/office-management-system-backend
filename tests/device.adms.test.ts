import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { EmployeeProfile } from '../src/modules/employees/employeeProfile.model';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { RawPunch } from '../src/modules/attendance/rawPunch.model';
import { BiometricDevice } from '../src/modules/attendance/biometricDevice.model';
import { hashPassword } from '../src/modules/auth/password';

const app = createApp();
let mongod: MongoMemoryServer;
const PW = 'Passw0rd!';
const SN = 'ZKTEST0001';

let adminToken: string;
let bioUserId: string; // employee mapped to PIN 1001

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PW });
  return res.body.data.accessToken;
}

async function makeUser(
  email: string,
  accountType: 'Owner' | 'Employee',
  orgRole: 'Admin' | 'Manager' | 'Lead' | 'Member',
  first: string,
  biometricUserId?: string,
) {
  const user = await User.create({
    email,
    passwordHash: await hashPassword(PW),
    accountType,
    orgRole,
    status: 'Active',
  });
  await EmployeeProfile.create({
    userId: user._id,
    firstName: first,
    lastName: 'Test',
    status: 'Active',
    biometricUserId,
  });
  return user;
}

// POST an ADMS ATTLOG batch exactly as the device would (tab-delimited text).
function postAttlog(lines: string[][]) {
  const body = lines.map((f) => f.join('\t')).join('\n');
  return request(app)
    .post(`/iclock/cdata?SN=${SN}&table=ATTLOG`)
    .set('Content-Type', 'text/plain')
    .send(body);
}

async function getDeviceId(): Promise<string> {
  const res = await request(app).get('/api/v1/attendance/devices').set('Authorization', `Bearer ${adminToken}`);
  return res.body.data.find((d: { serial: string }) => d.serial === SN).id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Ensure indexes are built before tests run — notably RawPunch's unique
  // `fingerprint`, which makes re-sent punches idempotent. Mongoose builds
  // indexes in the background, so without this the idempotency test can race
  // the build under parallel load and see duplicates stored.
  await RawPunch.init();
  await makeUser('admin@dev.test', 'Owner', 'Admin', 'Ada');
  const bio = await makeUser('bio@dev.test', 'Employee', 'Member', 'Bio', '1001');
  bioUserId = String(bio._id);
  adminToken = await login('admin@dev.test');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('ZKTeco ADMS push ingestion', () => {
  it('answers the device handshake with push options', async () => {
    const res = await request(app).get(`/iclock/cdata?SN=${SN}&options=all`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`GET OPTION FROM: ${SN}`);
    expect(res.text).toContain('Realtime=1');
    // The device must be auto-registered, but as Pending (not trusted yet).
    const dev = await BiometricDevice.findOne({ serial: SN });
    expect(dev?.status).toBe('Pending');
  });

  it('stores punches but does NOT derive attendance while the device is Pending', async () => {
    const res = await postAttlog([
      ['1001', '2026-10-02 09:05:00', '0', '1', '0'],
      ['1001', '2026-10-02 18:10:00', '1', '1', '0'],
    ]);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/OK:\s*2/);
    // Raw punches stored and matched to the employee...
    const punches = await RawPunch.find({ deviceSerial: SN, pin: '1001' });
    expect(punches).toHaveLength(2);
    expect(punches.every((p) => String(p.matchedUserId) === bioUserId)).toBe(true);
    // ...but no attendance yet (device not enabled).
    const att = await Attendance.findOne({ userId: bioUserId, date: '2026-10-02' });
    expect(att).toBeNull();
  });

  it('derives attendance (first=in, last=out) when the device is enabled', async () => {
    const id = await getDeviceId();
    const res = await request(app)
      .patch(`/api/v1/attendance/devices/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Enabled' });
    expect(res.status).toBe(200);

    const att = await Attendance.findOne({ userId: bioUserId, date: '2026-10-02' });
    expect(att).not.toBeNull();
    expect(att?.source).toBe('BiometricImport');
    expect(att?.status).toBe('Present');
    // 09:05 -> 18:10 = 545 minutes worked.
    expect(att?.workedMinutes).toBe(545);
    expect(att?.checkInAt?.toISOString()).toBe(new Date('2026-10-02T04:05:00.000Z').toISOString()); // 09:05 PKT
    expect(att?.checkOutAt?.toISOString()).toBe(new Date('2026-10-02T13:10:00.000Z').toISOString()); // 18:10 PKT
  });

  it('is idempotent — re-sending the same punches creates no duplicates', async () => {
    const before = await RawPunch.countDocuments({ deviceSerial: SN });
    const res = await postAttlog([
      ['1001', '2026-10-02 09:05:00', '0', '1', '0'],
      ['1001', '2026-10-02 18:10:00', '1', '1', '0'],
    ]);
    expect(res.status).toBe(200);
    const after = await RawPunch.countDocuments({ deviceSerial: SN });
    expect(after).toBe(before);
  });

  it('parks punches from an unmapped PIN and reconciles them on mapping', async () => {
    await postAttlog([['7777', '2026-10-02 10:00:00', '0', '1', '0']]);
    // shows up as unmapped
    const list = await request(app)
      .get('/api/v1/attendance/devices/unmapped')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: { pin: string }) => r.pin === '7777');
    expect(row).toBeTruthy();
    expect(row.punchCount).toBe(1);

    // map PIN 7777 to a (new) employee -> their punch becomes attendance
    const late = await makeUser('late@dev.test', 'Employee', 'Member', 'Late');
    const map = await request(app)
      .post('/api/v1/attendance/devices/map')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '7777', userId: String(late._id) });
    expect(map.status).toBe(200);
    expect(map.body.data.matched).toBe(1);
    const att = await Attendance.findOne({ userId: late._id, date: '2026-10-02' });
    expect(att).not.toBeNull(); // single punch -> check-in only, Present
    expect(att?.status).toBe('Present');
  });

  it('ignores a Disabled device entirely', async () => {
    const id = await getDeviceId();
    await request(app)
      .patch(`/api/v1/attendance/devices/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Disabled' });
    const before = await RawPunch.countDocuments({ deviceSerial: SN });
    await postAttlog([['1001', '2026-10-05 09:00:00', '0', '1', '0']]);
    const after = await RawPunch.countDocuments({ deviceSerial: SN });
    expect(after).toBe(before); // nothing stored for a disabled device
  });
});

describe('Portal device-down submission (regularization kind=DeviceDown)', () => {
  it('a user self-reports attendance -> manager approves -> attendance recorded', async () => {
    const token = await login('bio@dev.test');
    const create = await request(app)
      .post('/api/v1/attendance/regularizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'DeviceDown',
        date: '2026-10-06',
        checkInAt: '2026-10-06T04:00:00.000Z',
        checkOutAt: '2026-10-06T13:00:00.000Z',
        reason: 'Power cut — biometric device was off',
      });
    expect(create.status).toBe(201);
    expect(create.body.data.kind).toBe('DeviceDown');

    const pending = await request(app)
      .get('/api/v1/attendance/regularizations?scope=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    const reqRow = pending.body.data.find((r: { date: string }) => r.date === '2026-10-06');
    expect(reqRow).toBeTruthy();

    const approve = await request(app)
      .patch(`/api/v1/attendance/regularizations/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('Approved');

    const att = await Attendance.findOne({ userId: bioUserId, date: '2026-10-06' });
    expect(att).not.toBeNull();
    expect(att?.status).toBe('Present');
    expect(att?.workedMinutes).toBe(540);
  });

  it('allows a DeviceDown report with only a check-in', async () => {
    const token = await login('bio@dev.test');
    const create = await request(app)
      .post('/api/v1/attendance/regularizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'DeviceDown',
        date: '2026-10-07',
        checkInAt: '2026-10-07T04:00:00.000Z',
        reason: 'Device down, forgot to note out-time',
      });
    expect(create.status).toBe(201);
    expect(create.body.data.requestedCheckOutAt).toBeUndefined();
  });
});
