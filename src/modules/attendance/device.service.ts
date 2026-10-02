import { Types } from 'mongoose';
import type {
  BiometricDeviceDTO,
  BiometricDeviceStatus,
  UnmappedPinDTO,
  DeviceReconcileResultDTO,
} from '@ems/types';
import type { DeviceUpdateInput, MapPinInput, DeviceReconcileInput } from '@ems/validation';
import { Attendance } from './attendance.model';
import { RawPunch } from './rawPunch.model';
import { BiometricDevice, type BiometricDeviceDoc } from './biometricDevice.model';
import { AttendancePolicy } from './config.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import {
  minutesBetween,
  overtimeMinutes,
  deriveStatus,
  dayKeyInTz,
  parseDeviceLocalTime,
  addDays,
} from './attendance.util';
import { logger } from '../../common/logger';
import { NotFoundError, ValidationError } from '../../common/errors';

/** Attendance policy (singleton) with schema defaults when not yet created. */
async function policyLike() {
  return (await AttendancePolicy.findOne({ key: 'default' })) ?? new AttendancePolicy({ key: 'default' });
}

async function enabledDeviceSerials(): Promise<string[]> {
  const docs = await BiometricDevice.find({ status: 'Enabled' }).select('serial');
  return docs.map((d) => d.serial);
}

function toDeviceDTO(d: BiometricDeviceDoc): BiometricDeviceDTO {
  return {
    id: String(d._id),
    serial: d.serial,
    label: d.label ?? undefined,
    status: (d.status ?? 'Pending') as BiometricDeviceStatus,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : undefined,
    lastPunchAt: d.lastPunchAt ? d.lastPunchAt.toISOString() : undefined,
    punchCount: d.punchCount ?? 0,
    firmware: d.firmware ?? undefined,
    ipHint: d.ipHint ?? undefined,
    createdAt: (d.createdAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------- device registry

/** Find-or-register a device by serial and stamp its heartbeat (lastSeenAt). */
export async function touchDevice(serial: string, ipHint?: string): Promise<BiometricDeviceDoc> {
  const set: Record<string, unknown> = { lastSeenAt: new Date() };
  if (ipHint) set.ipHint = ipHint;
  const dev = await BiometricDevice.findOneAndUpdate(
    { serial },
    { $set: set, $setOnInsert: { status: 'Pending' } },
    { upsert: true, new: true },
  );
  if (!dev) throw new Error('device upsert failed');
  return dev;
}

// ---------------------------------------------------------------- ADMS handshake

/** Plain-text option block returned to the device on the GET /iclock/cdata
 *  handshake. Realtime=1 turns on push; the critical contract is the OK:<count>
 *  ack on ATTLOG. Values may need tuning per firmware. */
export function handshakeOptions(serial: string): string {
  return [
    `GET OPTION FROM: ${serial}`,
    `Stamp=9999`,
    `OpStamp=9999`,
    `ErrorDelay=30`,
    `Delay=10`,
    `TransTimes=00:00;23:59`,
    `TransInterval=1`,
    `TransFlag=111111111111`,
    `Realtime=1`,
    `Encrypt=0`,
    ``,
  ].join('\n');
}

// ---------------------------------------------------------------- ingest

interface ParsedPunch {
  pin: string;
  timestamp: Date;
  status?: number;
  verify?: number;
  workcode?: string;
  raw: string;
}

/** Parse an ADMS ATTLOG body: one punch per line, TAB-separated:
 *  PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode ... */
function parseAttlog(body: string, tz: string): ParsedPunch[] {
  const out: ParsedPunch[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const f = trimmed.split('\t');
    const pin = (f[0] ?? '').trim();
    const timeStr = (f[1] ?? '').trim();
    if (!pin || !timeStr) continue;
    let timestamp: Date;
    try {
      timestamp = parseDeviceLocalTime(timeStr, tz);
    } catch {
      logger.warn({ line: trimmed }, 'device: skipping unparseable punch');
      continue;
    }
    const num = (v?: string): number | undefined => {
      if (v == null || v.trim() === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    out.push({
      pin,
      timestamp,
      status: num(f[2]),
      verify: num(f[3]),
      workcode: f[4]?.trim() || undefined,
      raw: trimmed,
    });
  }
  return out;
}

export interface IngestResult {
  received: number;
  stored: number;
  duplicates: number;
  derived: number;
}

/**
 * Ingest an ATTLOG batch. Raw punches are ALWAYS stored (deduped by fingerprint)
 * so nothing is lost; attendance is only derived for punches from an Enabled
 * device (deriveDay self-gates on that), so a Pending/rogue device can't inject
 * attendance. A Disabled device is ignored entirely.
 */
export async function ingestAttlog(serial: string, body: string): Promise<IngestResult> {
  const device = await touchDevice(serial);
  const tz = (await policyLike()).timezone ?? 'Asia/Karachi';
  const punches = parseAttlog(body, tz);
  const result: IngestResult = { received: punches.length, stored: 0, duplicates: 0, derived: 0 };
  if (device.status === 'Disabled') return result;

  const affected = new Map<string, { userId: string; dayKey: string }>();
  let lastPunchAt: Date | undefined;

  for (const p of punches) {
    const dayKey = dayKeyInTz(p.timestamp, tz);
    const fingerprint = `${serial}|${p.pin}|${p.timestamp.toISOString()}|${p.status ?? ''}`;
    const profile = await EmployeeProfile.findOne({ biometricUserId: p.pin }).select('userId');
    const matchedUserId = profile?.userId ?? null;
    try {
      await RawPunch.create({
        deviceSerial: serial,
        pin: p.pin,
        timestamp: p.timestamp,
        dayKey,
        status: p.status,
        verify: p.verify,
        workcode: p.workcode,
        matchedUserId,
        raw: p.raw,
        fingerprint,
      });
      result.stored++;
      if (matchedUserId) affected.set(`${matchedUserId}|${dayKey}`, { userId: String(matchedUserId), dayKey });
      if (!lastPunchAt || p.timestamp > lastPunchAt) lastPunchAt = p.timestamp;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        result.duplicates++;
        continue;
      }
      throw e;
    }
  }

  if (result.stored) {
    const update: Record<string, unknown> = { $inc: { punchCount: result.stored } };
    if (lastPunchAt) update.$max = { lastPunchAt };
    await BiometricDevice.updateOne({ serial }, update);
  }
  if (result.stored > 0 && affected.size === 0) {
    logger.info({ serial, stored: result.stored }, 'device: punches had no mapped employees (parked for HR)');
  }

  for (const { userId, dayKey } of affected.values()) {
    if (await deriveDay(userId, dayKey)) result.derived++;
  }
  return result;
}

/**
 * Recompute the daily Attendance doc for (userId, dayKey) from the raw punches
 * of ENABLED devices only. First punch = check-in, last = check-out. Never
 * clobbers a manual AdminEntry record. Idempotent.
 */
export async function deriveDay(userId: string | Types.ObjectId, dayKey: string): Promise<boolean> {
  const uid = new Types.ObjectId(String(userId));
  const serials = await enabledDeviceSerials();
  if (!serials.length) return false;
  const punches = await RawPunch.find({
    matchedUserId: uid,
    dayKey,
    deviceSerial: { $in: serials },
  }).sort({ timestamp: 1 });
  if (!punches.length) return false;

  const existing = await Attendance.findOne({ userId: uid, date: dayKey }).select('source');
  if (existing && existing.source === 'AdminEntry') {
    logger.info({ userId: String(uid), dayKey }, 'device: keeping manual AdminEntry (not overwriting)');
    return false;
  }

  const first = punches[0]!.timestamp as Date;
  const last = punches[punches.length - 1]!.timestamp as Date;
  const hasOut = last.getTime() > first.getTime();
  const policy = await policyLike();
  const workedMinutes = hasOut ? minutesBetween(first, last) : 0;
  await Attendance.findOneAndUpdate(
    { userId: uid, date: dayKey },
    {
      $set: {
        checkInAt: first,
        checkOutAt: hasOut ? last : null,
        source: 'BiometricImport',
        workedMinutes,
        overtimeMinutes: hasOut ? overtimeMinutes(workedMinutes, policy) : 0,
        status: hasOut ? deriveStatus(workedMinutes, policy) : 'Present',
      },
    },
    { upsert: true, new: true },
  );
  return true;
}

// ---------------------------------------------------------------- device admin

export async function listDevices(): Promise<BiometricDeviceDTO[]> {
  const docs = await BiometricDevice.find().sort({ createdAt: 1 });
  return docs.map(toDeviceDTO);
}

export async function updateDevice(id: string, input: DeviceUpdateInput): Promise<BiometricDeviceDTO> {
  const dev = await BiometricDevice.findById(id);
  if (!dev) throw new NotFoundError('Device not found');
  const wasEnabled = dev.status === 'Enabled';
  if (input.label !== undefined) dev.label = input.label;
  if (input.status !== undefined) dev.status = input.status;
  await dev.save();
  // Enabling a device turns its already-buffered punches into attendance.
  if (!wasEnabled && dev.status === 'Enabled') {
    const n = await rederiveSerial(dev.serial);
    logger.info({ serial: dev.serial, days: n }, 'device enabled: back-derived attendance');
  }
  return toDeviceDTO(dev);
}

async function rederiveSerial(serial: string): Promise<number> {
  const pairs = await RawPunch.aggregate<{ _id: { userId: Types.ObjectId; dayKey: string } }>([
    { $match: { deviceSerial: serial, matchedUserId: { $ne: null } } },
    { $group: { _id: { userId: '$matchedUserId', dayKey: '$dayKey' } } },
  ]);
  let n = 0;
  for (const p of pairs) {
    if (await deriveDay(p._id.userId, p._id.dayKey)) n++;
  }
  return n;
}

// ---------------------------------------------------------------- mapping

export async function listUnmappedPins(): Promise<UnmappedPinDTO[]> {
  const rows = await RawPunch.aggregate<{
    _id: { deviceSerial: string; pin: string };
    punchCount: number;
    firstSeen: Date;
    lastSeen: Date;
  }>([
    { $match: { matchedUserId: null } },
    {
      $group: {
        _id: { deviceSerial: '$deviceSerial', pin: '$pin' },
        punchCount: { $sum: 1 },
        firstSeen: { $min: '$timestamp' },
        lastSeen: { $max: '$timestamp' },
      },
    },
    { $sort: { lastSeen: -1 } },
  ]);
  return rows.map((r) => ({
    deviceSerial: r._id.deviceSerial,
    pin: r._id.pin,
    punchCount: r.punchCount,
    firstSeen: r.firstSeen.toISOString(),
    lastSeen: r.lastSeen.toISOString(),
  }));
}

/** Assign a device PIN to an employee: set their biometricUserId, back-fill the
 *  matched user on existing punches, and re-derive their affected days. */
export async function mapPinToEmployee(input: MapPinInput): Promise<{ matched: number; derived: number }> {
  const uid = new Types.ObjectId(input.userId);
  const profile = await EmployeeProfile.findOne({ userId: uid });
  if (!profile) throw new NotFoundError('Employee not found');
  const clash = await EmployeeProfile.findOne({
    biometricUserId: input.pin,
    userId: { $ne: uid },
  });
  if (clash) throw new ValidationError('That device ID is already assigned to another employee');

  profile.biometricUserId = input.pin;
  await profile.save();

  const res = await RawPunch.updateMany(
    { pin: input.pin, matchedUserId: null },
    { $set: { matchedUserId: uid } },
  );
  const days = (await RawPunch.distinct('dayKey', { pin: input.pin, matchedUserId: uid })) as string[];
  let derived = 0;
  for (const dayKey of days) {
    if (await deriveDay(uid, dayKey)) derived++;
  }
  return { matched: res.modifiedCount ?? 0, derived };
}

// ---------------------------------------------------------------- reconcile / health

/** Safety-net re-derivation across a day range from already-stored punches.
 *  Idempotent; used by the scheduler and the admin "Re-sync" button. */
export async function reconcile(input: DeviceReconcileInput = {}): Promise<DeviceReconcileResultDTO> {
  const tz = (await policyLike()).timezone ?? 'Asia/Karachi';
  const to = input.to ?? dayKeyInTz(new Date(), tz);
  const from = input.from ?? addDays(to, -3);
  const serials = await enabledDeviceSerials();
  if (!serials.length) return { from, to, daysRederived: 0, punchesConsidered: 0 };

  const pairs = await RawPunch.aggregate<{
    _id: { userId: Types.ObjectId; dayKey: string };
    n: number;
  }>([
    {
      $match: {
        matchedUserId: { $ne: null },
        deviceSerial: { $in: serials },
        dayKey: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: { userId: '$matchedUserId', dayKey: '$dayKey' }, n: { $sum: 1 } } },
  ]);

  let daysRederived = 0;
  let punchesConsidered = 0;
  for (const p of pairs) {
    punchesConsidered += p.n;
    if (await deriveDay(p._id.userId, p._id.dayKey)) daysRederived++;
  }
  return { from, to, daysRederived, punchesConsidered };
}

/** Warn about Enabled devices that haven't been heard from recently. */
export async function checkDeviceSilence(maxSilentMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - maxSilentMinutes * 60_000);
  const silent = await BiometricDevice.find({
    status: 'Enabled',
    $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: { $exists: false } }],
  });
  for (const d of silent) {
    logger.warn({ serial: d.serial, lastSeenAt: d.lastSeenAt }, 'biometric device appears silent');
  }
  return silent.length;
}
