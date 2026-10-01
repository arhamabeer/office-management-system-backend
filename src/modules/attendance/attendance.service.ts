import { Types } from 'mongoose';
import type {
  AttendanceDTO,
  AttendanceStatus,
  AttendanceSource,
  AttendanceSummary,
  MyAttendanceResponse,
  AttendancePolicyDTO,
  AttendanceRosterDTO,
  AttendanceRosterRowDTO,
  RosterStatus,
  AutoAbsentRunResultDTO,
  AttendanceReportDTO,
  AttendanceReportRowDTO,
  PersonWeeksDTO,
  HolidayDTO,
  RegularizationDTO,
  TeamAttendanceDTO,
  Paginated,
} from '@ems/types';
import type {
  CheckInInput,
  CheckOutInput,
  AdminEntryInput,
  RegularizationCreateInput,
  UpdateAttendancePolicyInput,
  HolidayInput,
  TeamAttendanceQuery,
  RosterQuery,
  AutoAbsentRunInput,
  AttendanceReportQuery,
  AttendanceReportExportQuery,
  PersonWeeksQuery,
} from '@ems/validation';
import { BRAND } from '@ems/config';
import type { AuthUser } from '../../middleware/auth';
import { Attendance, type AttendanceDoc } from './attendance.model';
import { AttendancePolicy, Holiday, type AttendancePolicyDoc } from './config.model';
import { Regularization, type RegularizationDoc } from './regularization.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { LeaveRequest } from '../leaves/leaveRequest.model';
import { scopedUserIds } from '../../common/scope';
import { User } from '../auth/user.model';
import {
  daysInMonth,
  minutesBetween,
  isWeekOff,
  weekdayOf,
  deriveStatus,
  overtimeMinutes,
  dayKeyInTz,
  minutesInTz,
  hhmmToMinutes,
  addDays,
} from './attendance.util';
import { summariseWeeks, recentWeekStarts, WEEKS_BACK } from './attendance.report';
import { buildReportPdf, buildReportXlsx, type ReportDetailRow } from './attendance.export';
import { sendAbsenceEmail } from '../../common/mailer';
import { notify } from '../../common/notify';
import { logger } from '../../common/logger';
import { pageMeta } from '../../common/httpResponse';
import { recordAudit } from '../../middleware/audit';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';

export interface Ctx {
  ip?: string;
}

function toDTO(a: AttendanceDoc): AttendanceDTO {
  return {
    id: String(a._id),
    userId: String(a.userId),
    date: a.date,
    checkInAt: a.checkInAt ? a.checkInAt.toISOString() : undefined,
    checkOutAt: a.checkOutAt ? a.checkOutAt.toISOString() : undefined,
    status: (a.status ?? 'Present') as AttendanceStatus,
    source: (a.source ?? 'SelfWeb') as AttendanceSource,
    workedMinutes: a.workedMinutes ?? 0,
    overtimeMinutes: a.overtimeMinutes ?? 0,
    note: a.note ?? undefined,
  };
}

function toRegDTO(r: RegularizationDoc, employeeName?: string): RegularizationDTO {
  return {
    id: String(r._id),
    userId: String(r.userId),
    employeeName,
    date: r.date,
    requestedCheckInAt: r.requestedCheckInAt.toISOString(),
    requestedCheckOutAt: r.requestedCheckOutAt.toISOString(),
    reason: r.reason,
    status: r.status as RegularizationDTO['status'],
    approverId: r.approverId ? String(r.approverId) : undefined,
    decidedById: r.decidedById ? String(r.decidedById) : undefined,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : undefined,
    comment: r.comment ?? undefined,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

export async function getPolicyDoc(): Promise<AttendancePolicyDoc> {
  const existing = await AttendancePolicy.findOne({ key: 'default' });
  if (existing) return existing;
  return AttendancePolicy.create({ key: 'default' });
}

/** The office timezone, tolerating policy docs saved before the field existed. */
function policyTz(p: AttendancePolicyDoc): string {
  return p.timezone ?? 'Asia/Karachi';
}

/** The current office calendar day (YYYY-MM-DD) in the policy's timezone. */
function resolveToday(p: AttendancePolicyDoc): string {
  return dayKeyInTz(new Date(), policyTz(p));
}

function policyDTO(p: AttendancePolicyDoc): AttendancePolicyDTO {
  return {
    workdayMinutes: p.workdayMinutes ?? 480,
    halfDayMinutes: p.halfDayMinutes ?? 240,
    shiftStart: p.shiftStart ?? '09:00',
    shiftEnd: p.shiftEnd ?? '18:00',
    weekOff: p.weekOff ?? [0, 6],
    graceMinutes: p.graceMinutes ?? 10,
    timezone: policyTz(p),
    autoAbsentEnabled: p.autoAbsentEnabled ?? true,
    autoAbsentCutoff: p.autoAbsentCutoff ?? '13:00',
    weeklyMinimumMinutes: p.weeklyMinimumMinutes ?? 2700,
  };
}

/** Owner/Admin/Manager/Lead may see team-wide roster and reports. */
function isPrivileged(actor: AuthUser): boolean {
  return (
    actor.accountType === 'Owner' ||
    actor.orgRole === 'Admin' ||
    actor.orgRole === 'Manager' ||
    actor.orgRole === 'Lead'
  );
}

// ---- self check-in / check-out ----

export async function checkIn(userId: string, input: CheckInInput, ctx: Ctx): Promise<AttendanceDTO> {
  // The office timezone defines "today", so a late check-in flips the same
  // record the auto-absent sweep created (Absent -> Present).
  const policy = await getPolicyDoc();
  const date = resolveToday(policy);
  const existing = await Attendance.findOne({ userId, date });
  if (existing?.checkInAt) throw new ConflictError('You have already checked in today');
  const doc = existing ?? new Attendance({ userId, date });
  doc.checkInAt = new Date();
  doc.source = input.source ?? 'SelfWeb';
  doc.status = 'Present';
  doc.workedMinutes = 0;
  doc.overtimeMinutes = 0;
  if (input.note) doc.note = input.note;
  if (ctx.ip) doc.ip = ctx.ip;
  if (input.geo) doc.geo = input.geo;
  await doc.save();
  return toDTO(doc);
}

export async function checkOut(userId: string, input: CheckOutInput): Promise<AttendanceDTO> {
  const policy = await getPolicyDoc();
  const today = resolveToday(policy);
  let doc = await Attendance.findOne({ userId, date: today });
  // Overnight shift: with no open check-in today, close yesterday's still-open
  // one (if the check-in was within the last 18h — beyond that it's a forgotten
  // checkout to correct via regularization, not an overnight shift).
  if (!doc?.checkInAt || doc.checkOutAt) {
    const prev = await Attendance.findOne({ userId, date: addDays(today, -1) });
    if (prev?.checkInAt && !prev.checkOutAt) {
      const hoursOpen = (Date.now() - prev.checkInAt.getTime()) / 3_600_000;
      if (hoursOpen <= 18) doc = prev;
    }
  }
  if (!doc || !doc.checkInAt) throw new ValidationError('You have not checked in');
  if (doc.checkOutAt) throw new ConflictError('You have already checked out today');
  doc.checkOutAt = new Date();
  doc.workedMinutes = minutesBetween(doc.checkInAt, doc.checkOutAt);
  doc.overtimeMinutes = overtimeMinutes(doc.workedMinutes, policy);
  doc.status = deriveStatus(doc.workedMinutes, policy);
  if (input.note) doc.note = input.note;
  await doc.save();
  return toDTO(doc);
}

// ---- my monthly view + summary ----

function buildSummary(
  month: string,
  recMap: Map<string, AttendanceDoc>,
  holidaySet: Set<string>,
  policy: AttendancePolicyDoc,
  today: string,
): AttendanceSummary {
  let present = 0,
    halfDay = 0,
    absent = 0,
    onLeave = 0,
    weekOff = 0,
    holiday = 0,
    workingDays = 0,
    totalWorked = 0,
    totalOt = 0;

  for (const day of daysInMonth(month)) {
    if (day > today) continue;
    const rec = recMap.get(day);
    if (rec) {
      totalWorked += rec.workedMinutes ?? 0;
      totalOt += rec.overtimeMinutes ?? 0;
      const s = rec.status;
      if (s === 'Present') present++;
      else if (s === 'HalfDay') halfDay++;
      else if (s === 'OnLeave') onLeave++;
      else if (s === 'Holiday') holiday++;
      else if (s === 'WeekOff') weekOff++;
      else if (s === 'Absent') absent++;
      else present++;
      if (s !== 'WeekOff' && s !== 'Holiday') workingDays++;
    } else if (holidaySet.has(day)) {
      holiday++;
    } else if (isWeekOff(day, policy)) {
      weekOff++;
    } else {
      absent++;
      workingDays++;
    }
  }
  const workedDays = present + halfDay;
  return {
    month,
    present,
    halfDay,
    absent,
    onLeave,
    weekOff,
    holiday,
    workingDays,
    totalWorkedMinutes: totalWorked,
    totalOvertimeMinutes: totalOt,
    avgWorkedMinutes: workedDays ? Math.round(totalWorked / workedDays) : 0,
  };
}

export async function getMyAttendance(userId: string, month?: string): Promise<MyAttendanceResponse> {
  const policy = await getPolicyDoc();
  const todayStr = resolveToday(policy);
  const m = month ?? todayStr.slice(0, 7);
  const [records, holidays] = await Promise.all([
    Attendance.find({ userId, date: new RegExp(`^${m}`) }).sort({ date: 1 }),
    Holiday.find({ date: new RegExp(`^${m}`) }),
  ]);
  const today = records.find((r) => r.date === todayStr) ?? null;
  const recMap = new Map(records.map((r) => [r.date, r]));
  const holidaySet = new Set(holidays.map((h) => h.date));
  return {
    today: today ? toDTO(today) : null,
    records: records.map(toDTO),
    summary: buildSummary(m, recMap, holidaySet, policy, todayStr),
  };
}


async function nameMap(userIds: Types.ObjectId[]): Promise<Map<string, { name: string; email: string }>> {
  const [profiles, users] = await Promise.all([
    EmployeeProfile.find({ userId: { $in: userIds } }).select('userId firstName lastName'),
    User.find({ _id: { $in: userIds } }).select('email'),
  ]);
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));
  const map = new Map<string, { name: string; email: string }>();
  for (const p of profiles) {
    map.set(String(p.userId), {
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: emailMap.get(String(p.userId)) ?? '',
    });
  }
  return map;
}

export async function getTeamAttendance(
  actor: AuthUser,
  query: TeamAttendanceQuery,
): Promise<Paginated<TeamAttendanceDTO>> {
  const { orgWide, ids } = await scopedUserIds(actor);
  const filter: Record<string, unknown> = {};
  if (!orgWide) filter.userId = { $in: ids };
  if (query.userId) {
    // A userId filter must stay inside the actor's scope — never widen it.
    const requested = new Types.ObjectId(query.userId);
    if (!orgWide && !ids.some((i) => i.equals(requested))) {
      throw new ForbiddenError('That employee is outside your team scope');
    }
    filter.userId = requested;
  }
  if (query.date) filter.date = query.date;
  else if (query.month) filter.date = new RegExp(`^${query.month}`);
  else filter.date = resolveToday(await getPolicyDoc());

  const [total, docs] = await Promise.all([
    Attendance.countDocuments(filter),
    Attendance.find(filter)
      .sort({ date: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
  ]);
  const names = await nameMap(docs.map((d) => d.userId));
  const items: TeamAttendanceDTO[] = docs.map((d) => {
    const info = names.get(String(d.userId));
    return { ...toDTO(d), employeeName: info?.name ?? '—', email: info?.email ?? '' };
  });
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
}

// ---- today's roster (all in-scope employees, incl. not-checked-in) ----

const firstNameOf = (full: string): string => full.trim().split(/\s+/)[0] || full || 'there';

/** Every in-scope Active employee's standing for a day — including those with
 *  no record yet (NotCheckedIn / WeekOff / Holiday / OnLeave). Owner/Admin see
 *  everyone; Managers/Leads see their team. Members are refused. */
export async function getRoster(actor: AuthUser, query: RosterQuery): Promise<AttendanceRosterDTO> {
  if (!isPrivileged(actor)) throw new ForbiddenError('You do not have access to the team roster');

  const policy = await getPolicyDoc();
  const tz = policyTz(policy);
  const date = query.date ?? resolveToday(policy);
  const weekOff = policy.weekOff ?? [0, 6];
  const weekend = weekOff.includes(weekdayOf(date));

  const { orgWide, ids } = await scopedUserIds(actor);
  const profileFilter: Record<string, unknown> = { status: 'Active' };
  if (!orgWide) profileFilter.userId = { $in: ids };
  const profiles = await EmployeeProfile.find(profileFilter).sort({ firstName: 1, lastName: 1 });
  // Employees who had joined on/before the date are the only ones expected.
  const expected = profiles.filter((p) => !p.joiningDate || dayKeyInTz(p.joiningDate, tz) <= date);
  const userIds = expected.map((p) => p.userId);

  const [records, holiday, approvedLeaves, users] = await Promise.all([
    Attendance.find({ userId: { $in: userIds }, date }),
    Holiday.findOne({ date }),
    LeaveRequest.find({
      userId: { $in: userIds },
      status: 'Approved',
      startDate: { $lte: date },
      endDate: { $gte: date },
    }).select('userId'),
    User.find({ _id: { $in: userIds } }).select('email'),
  ]);
  const recMap = new Map(records.map((r) => [String(r.userId), r]));
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));
  const leaveSet = new Set(approvedLeaves.map((l) => String(l.userId)));

  const counts = { present: 0, halfDay: 0, absent: 0, onLeave: 0, notCheckedIn: 0, weekOff: 0, holiday: 0 };
  const rows: AttendanceRosterRowDTO[] = expected.map((p) => {
    const uid = String(p.userId);
    const rec = recMap.get(uid);
    let status: RosterStatus;
    let checkInAt: string | undefined;
    let checkOutAt: string | undefined;
    let workedMinutes = 0;
    if (rec) {
      status = (rec.status ?? 'Present') as RosterStatus;
      checkInAt = rec.checkInAt?.toISOString();
      checkOutAt = rec.checkOutAt?.toISOString();
      workedMinutes = rec.workedMinutes ?? 0;
    } else if (holiday) {
      status = 'Holiday';
    } else if (weekend) {
      status = 'WeekOff';
    } else if (leaveSet.has(uid)) {
      status = 'OnLeave';
    } else {
      status = 'NotCheckedIn';
    }
    if (status === 'Present') counts.present++;
    else if (status === 'HalfDay') counts.halfDay++;
    else if (status === 'Absent') counts.absent++;
    else if (status === 'OnLeave') counts.onLeave++;
    else if (status === 'WeekOff') counts.weekOff++;
    else if (status === 'Holiday') counts.holiday++;
    else counts.notCheckedIn++;
    return {
      userId: uid,
      employeeName: `${p.firstName} ${p.lastName}`.trim(),
      email: emailMap.get(uid) ?? '',
      designation: p.designation ?? undefined,
      status,
      checkInAt,
      checkOutAt,
      workedMinutes,
    };
  });

  return {
    date,
    nonWorking: !!holiday || weekend,
    nonWorkingReason: holiday ? holiday.name : weekend ? 'Weekend' : undefined,
    counts,
    rows,
  };
}

// ---- weekly / period reports ----

interface ReportData {
  report: AttendanceReportDTO;
  detail: ReportDetailRow[];
}

/** Plain (lean) shape of the attendance fields the report reads. */
interface LeanAttendance {
  userId: Types.ObjectId;
  date: string;
  status?: string | null;
  workedMinutes?: number | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}

/** Shared builder for the period report + its export detail rows. Lead+ only. */
async function buildReportData(actor: AuthUser, period: AttendanceReportQuery['period']): Promise<ReportData> {
  if (!isPrivileged(actor)) throw new ForbiddenError('You do not have access to attendance reports');
  const policy = await getPolicyDoc();
  const today = resolveToday(policy);
  const weeklyMin = policy.weeklyMinimumMinutes ?? 2700;
  const weekStarts = recentWeekStarts(today, WEEKS_BACK[period]);
  const start = weekStarts[0];
  const end = today;

  const { orgWide, ids } = await scopedUserIds(actor);
  const profileFilter: Record<string, unknown> = { status: 'Active' };
  if (!orgWide) profileFilter.userId = { $in: ids };
  const profiles = await EmployeeProfile.find(profileFilter).sort({ firstName: 1, lastName: 1 });
  const userIds = profiles.map((p) => p.userId);

  // Read-only: .lean() returns plain objects (no hydration cost) for the report.
  const [records, users] = await Promise.all([
    Attendance.find({ userId: { $in: userIds }, date: { $gte: start, $lte: end } })
      .sort({ date: 1 })
      .lean<LeanAttendance[]>(),
    User.find({ _id: { $in: userIds } }).select('email'),
  ]);
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));
  const nameMap = new Map(profiles.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]));
  const byUser = new Map<string, LeanAttendance[]>();
  for (const r of records) {
    const k = String(r.userId);
    const arr = byUser.get(k);
    if (arr) arr.push(r);
    else byUser.set(k, [r]);
  }

  const rows: AttendanceReportRowDTO[] = profiles.map((p) => {
    const uid = String(p.userId);
    const weeks = summariseWeeks(byUser.get(uid) ?? [], weekStarts, weeklyMin, today);
    // Average only over weeks that elapsed AND had expected work (present/half/
    // absent) — mirrors the `short` guard so pre-join / full-leave weeks don't
    // dilute the average or inflate the week count.
    const counted = weeks.filter((w) => w.complete && w.present + w.halfDay + w.absent > 0);
    const totalWorkedMinutes = weeks.reduce((n, w) => n + w.workedMinutes, 0);
    const countedMinutes = counted.reduce((n, w) => n + w.workedMinutes, 0);
    return {
      userId: uid,
      employeeName: nameMap.get(uid) ?? '—',
      email: emailMap.get(uid) ?? '',
      designation: p.designation ?? undefined,
      totalWorkedMinutes,
      avgWeeklyMinutes: counted.length ? Math.round(countedMinutes / counted.length) : 0,
      daysPresent: weeks.reduce((n, w) => n + w.present + w.halfDay, 0),
      daysAbsent: weeks.reduce((n, w) => n + w.absent, 0),
      daysOnLeave: weeks.reduce((n, w) => n + w.onLeave, 0),
      shortWeeks: weeks.filter((w) => w.short).length,
      completedWeeks: counted.length,
    };
  });

  const byHoursDesc = [...rows].sort((a, b) => b.totalWorkedMinutes - a.totalWorkedMinutes);
  const report: AttendanceReportDTO = {
    period,
    start,
    end,
    weeklyMinimumMinutes: weeklyMin,
    rows,
    top: byHoursDesc.slice(0, 3),
    lowest: byHoursDesc.slice().reverse().slice(0, 3),
  };

  const detail: ReportDetailRow[] = records.map((r) => ({
    date: r.date,
    employeeName: nameMap.get(String(r.userId)) ?? '',
    email: emailMap.get(String(r.userId)) ?? '',
    status: (r.status ?? 'Present') as string,
    checkInAt: r.checkInAt ? r.checkInAt.toISOString() : '',
    checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : '',
    workedMinutes: r.workedMinutes ?? 0,
  }));

  return { report, detail };
}

export async function getAttendanceReport(
  actor: AuthUser,
  query: AttendanceReportQuery,
): Promise<AttendanceReportDTO> {
  const { report } = await buildReportData(actor, query.period);
  await recordAudit({
    action: 'attendance.report_viewed',
    actorId: actor.id,
    actorLabel: actor.email,
    meta: { period: query.period },
  });
  return report;
}

export async function getReportExport(
  actor: AuthUser,
  query: AttendanceReportExportQuery,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const { report, detail } = await buildReportData(actor, query.period);
  await recordAudit({
    action: 'attendance.report_exported',
    actorId: actor.id,
    actorLabel: actor.email,
    meta: { period: query.period, format: query.format },
  });
  const base = `attendance-report-${report.start}_to_${report.end}`;
  if (query.format === 'pdf') {
    return { buffer: await buildReportPdf(report), filename: `${base}.pdf`, contentType: 'application/pdf' };
  }
  return {
    buffer: await buildReportXlsx(report, detail),
    filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** Last-N-weeks breakdown for one person (drill-down / accordion). Callable for
 *  yourself, or by a privileged actor for anyone in their scope. */
export async function getPersonWeeks(
  actor: AuthUser,
  userId: string,
  query: PersonWeeksQuery,
): Promise<PersonWeeksDTO> {
  // Compare ObjectIds by value (case-insensitive) like getTeamAttendance —
  // the userId param may arrive as upper-case hex.
  const { orgWide, ids } = await scopedUserIds(actor);
  const requested = new Types.ObjectId(userId);
  const inScope = orgWide || requested.equals(actor.id) || ids.some((i) => i.equals(requested));
  if (!inScope) throw new ForbiddenError('That employee is outside your scope');

  const policy = await getPolicyDoc();
  const today = resolveToday(policy);
  const weeklyMin = policy.weeklyMinimumMinutes ?? 2700;
  const weekStarts = recentWeekStarts(today, query.count);
  const start = weekStarts[0];

  const [profile, records] = await Promise.all([
    EmployeeProfile.findOne({ userId }).select('firstName lastName'),
    Attendance.find({ userId, date: { $gte: start, $lte: today } })
      .sort({ date: 1 })
      .lean<LeanAttendance[]>(),
  ]);
  const weeks = summariseWeeks(records, weekStarts, weeklyMin, today);
  return {
    userId,
    employeeName: profile ? `${profile.firstName} ${profile.lastName}`.trim() : '—',
    weeklyMinimumMinutes: weeklyMin,
    weeks: weeks.slice().reverse(), // most-recent first
  };
}

// ---- auto-absent sweep (scheduled + manual) ----

/**
 * Mark every Active employee who hasn't checked in by the cut-off as Absent for
 * the day and email them + their manager/lead. Idempotent per day via
 * `autoAbsentLastRunDate`. A later check-in flips the record back to Present
 * (see `checkIn`). Owners/Admins, weekends, holidays, approved leave and
 * pre-joiners are skipped. `force` ignores the enabled flag, cut-off and the
 * once-a-day guard (for manual runs); weekends/holidays are still respected.
 */
export async function runAutoAbsent(
  input: AutoAbsentRunInput = {},
  actor?: AuthUser,
): Promise<AutoAbsentRunResultDTO> {
  const policy = await getPolicyDoc();
  const force = input.force ?? false;
  const tz = policyTz(policy);
  const now = new Date();
  const date = dayKeyInTz(now, tz);
  const cutoff = policy.autoAbsentCutoff ?? '13:00';
  const result: AutoAbsentRunResultDTO = { date, ran: false, markedAbsent: 0, notified: 0 };

  if (!(policy.autoAbsentEnabled ?? true) && !force) return { ...result, skipped: 'disabled' };
  if (!force) {
    if (minutesInTz(now, tz) < hhmmToMinutes(cutoff)) return { ...result, skipped: 'before-cutoff' };
    if (policy.autoAbsentLastRunDate === date) return { ...result, skipped: 'already-ran' };
  }

  const weekend = (policy.weekOff ?? [0, 6]).includes(weekdayOf(date));
  const isHoliday = !!(await Holiday.exists({ date }));
  if (weekend || isHoliday) {
    policy.autoAbsentLastRunDate = date;
    await policy.save();
    return { ...result, ran: true, skipped: weekend ? 'weekend' : 'holiday' };
  }

  const profiles = await EmployeeProfile.find({ status: 'Active' });
  const expected = profiles.filter((p) => !p.joiningDate || dayKeyInTz(p.joiningDate, tz) <= date);
  const userIds = expected.map((p) => p.userId);

  const [records, approvedLeaves, users] = await Promise.all([
    Attendance.find({ userId: { $in: userIds }, date }),
    LeaveRequest.find({
      userId: { $in: userIds },
      status: 'Approved',
      startDate: { $lte: date },
      endDate: { $gte: date },
    }).select('userId'),
    User.find({ _id: { $in: userIds } }).select('email accountType orgRole'),
  ]);
  const recMap = new Map(records.map((r) => [String(r.userId), r]));
  const leaveSet = new Set(approvedLeaves.map((l) => String(l.userId)));
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));
  // Owners and Admins run the office — they're exempt from being auto-marked absent.
  const exemptSet = new Set(
    users.filter((u) => u.accountType === 'Owner' || u.orgRole === 'Admin').map((u) => String(u._id)),
  );

  const absentees: { userId: string; name: string; email: string; managerIds: string[] }[] = [];
  for (const p of expected) {
    const uid = String(p.userId);
    if (exemptSet.has(uid)) continue; // Owner/Admin — exempt
    if (leaveSet.has(uid)) continue; // on approved leave
    const rec = recMap.get(uid);
    if (rec?.checkInAt) continue; // already checked in / present
    // Already marked absent by a prior run today — don't re-mark or re-email.
    if (rec && rec.status === 'Absent' && rec.source === 'System') continue;
    const doc = rec ?? new Attendance({ userId: p.userId, date });
    doc.status = 'Absent';
    doc.source = 'System';
    doc.workedMinutes = 0;
    doc.overtimeMinutes = 0;
    await doc.save();
    result.markedAbsent++;
    absentees.push({
      userId: uid,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: emailMap.get(uid) ?? '',
      managerIds: [p.reportsToId, p.leadId].filter(Boolean).map((x) => String(x)),
    });
  }

  // Resolve manager/lead recipients (they may sit outside `expected`).
  const mgrIdSet = new Set<string>();
  for (const a of absentees) for (const m of a.managerIds) mgrIdSet.add(m);
  const mgrIds = [...mgrIdSet].map((id) => new Types.ObjectId(id));
  const [mgrUsers, mgrProfiles] = await Promise.all([
    mgrIds.length ? User.find({ _id: { $in: mgrIds } }).select('email') : Promise.resolve([]),
    mgrIds.length
      ? EmployeeProfile.find({ userId: { $in: mgrIds } }).select('userId firstName lastName')
      : Promise.resolve([]),
  ]);
  const mgrEmail = new Map(mgrUsers.map((u) => [String(u._id), u.email]));
  const mgrName = new Map(
    mgrProfiles.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]),
  );

  for (const a of absentees) {
    await notify({
      userId: a.userId,
      type: 'attendance.absent',
      title: `Marked absent for ${date}`,
      body: `You hadn't checked in by ${cutoff}, so you were marked absent. Check in now to update it.`,
      link: '/attendance',
    });
    if (a.email) {
      await sendAbsenceEmail({ to: a.email, name: firstNameOf(a.name), date, orgName: BRAND.name, cutoff });
      result.notified++;
    }
    const seen = new Set<string>();
    for (const mid of a.managerIds) {
      if (seen.has(mid)) continue;
      seen.add(mid);
      const to = mgrEmail.get(mid);
      if (!to) continue;
      await sendAbsenceEmail({
        to,
        name: firstNameOf(mgrName.get(mid) ?? 'there'),
        date,
        orgName: BRAND.name,
        cutoff,
        managerCopyFor: a.name,
      });
      result.notified++;
    }
  }

  policy.autoAbsentLastRunDate = date;
  await policy.save();
  result.ran = true;
  await recordAudit({
    action: 'attendance.auto_absent',
    actorId: actor?.id,
    actorLabel: actor ? actor.email : 'system (scheduled)',
    meta: { date, markedAbsent: result.markedAbsent, notified: result.notified, trigger: actor ? 'manual' : 'scheduled', force },
  });
  logger.info(
    { date, markedAbsent: result.markedAbsent, notified: result.notified },
    'attendance: auto-absent sweep complete',
  );
  return result;
}

// ---- admin manual entry ----

export async function adminEntry(actor: AuthUser, input: AdminEntryInput): Promise<AttendanceDTO> {
  const policy = await getPolicyDoc();
  const doc =
    (await Attendance.findOne({ userId: input.userId, date: input.date })) ??
    new Attendance({ userId: input.userId, date: input.date });
  if (input.checkInAt) doc.checkInAt = input.checkInAt;
  if (input.checkOutAt) doc.checkOutAt = input.checkOutAt;
  doc.source = 'AdminEntry';
  doc.createdById = new Types.ObjectId(actor.id);
  if (input.note) doc.note = input.note;
  if (doc.checkInAt && doc.checkOutAt) {
    doc.workedMinutes = minutesBetween(doc.checkInAt, doc.checkOutAt);
    doc.overtimeMinutes = overtimeMinutes(doc.workedMinutes, policy);
    doc.status = input.status ?? deriveStatus(doc.workedMinutes, policy);
  } else if (input.status) {
    doc.status = input.status;
  }
  await doc.save();
  await recordAudit({
    action: 'attendance.admin_entry',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'User',
    targetId: input.userId,
    meta: { date: input.date },
  });
  return toDTO(doc);
}

// ---- regularization ----

export async function createRegularization(
  userId: string,
  input: RegularizationCreateInput,
): Promise<RegularizationDTO> {
  const profile = await EmployeeProfile.findOne({ userId }).select('reportsToId firstName lastName');
  const doc = await Regularization.create({
    userId,
    date: input.date,
    requestedCheckInAt: input.checkInAt,
    requestedCheckOutAt: input.checkOutAt,
    reason: input.reason,
    approverId: profile?.reportsToId ?? undefined,
    status: 'Pending',
  });
  if (profile?.reportsToId) {
    const who = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'An employee';
    await notify({
      userId: String(profile.reportsToId),
      type: 'approval.pending',
      title: 'Attendance correction to review',
      body: `${who} requested a correction for ${input.date}.`,
      link: '/approvals',
      email: true,
    });
  }
  return toRegDTO(doc);
}

export async function listRegularizations(
  actor: AuthUser,
  scope: 'mine' | 'pending',
): Promise<RegularizationDTO[]> {
  if (scope === 'mine') {
    const docs = await Regularization.find({ userId: actor.id }).sort({ createdAt: -1 });
    return docs.map((d) => toRegDTO(d));
  }
  // pending for approver: requests in the actor's team scope
  const { orgWide, ids } = await scopedUserIds(actor);
  const filter: Record<string, unknown> = { status: 'Pending' };
  if (!orgWide) filter.userId = { $in: ids };
  const docs = await Regularization.find(filter).sort({ createdAt: -1 });
  const names = await nameMap(docs.map((d) => d.userId));
  return docs.map((d) => toRegDTO(d, names.get(String(d.userId))?.name));
}

export async function decideRegularization(
  actor: AuthUser,
  id: string,
  approve: boolean,
  comment?: string,
): Promise<RegularizationDTO> {
  const req = await Regularization.findById(id);
  if (!req) throw new NotFoundError('Regularization request not found');
  if (req.status !== 'Pending') throw new ConflictError('This request has already been decided');

  const { orgWide, ids } = await scopedUserIds(actor);
  const inScope = orgWide || ids.some((i) => String(i) === String(req.userId));
  if (!inScope) throw new ForbiddenError('This request is outside your team');
  if (String(req.userId) === actor.id && !orgWide) {
    throw new ForbiddenError('You cannot approve your own request');
  }

  if (approve) {
    const policy = await getPolicyDoc();
    const doc =
      (await Attendance.findOne({ userId: req.userId, date: req.date })) ??
      new Attendance({ userId: req.userId, date: req.date });
    doc.checkInAt = req.requestedCheckInAt;
    doc.checkOutAt = req.requestedCheckOutAt;
    doc.workedMinutes = minutesBetween(req.requestedCheckInAt, req.requestedCheckOutAt);
    doc.overtimeMinutes = overtimeMinutes(doc.workedMinutes, policy);
    doc.status = deriveStatus(doc.workedMinutes, policy);
    doc.source = 'AdminEntry';
    doc.createdById = new Types.ObjectId(actor.id);
    await doc.save();
  }
  req.status = approve ? 'Approved' : 'Rejected';
  req.decidedById = new Types.ObjectId(actor.id);
  req.decidedAt = new Date();
  if (comment) req.comment = comment;
  await req.save();

  await recordAudit({
    action: approve ? 'attendance.regularization_approved' : 'attendance.regularization_rejected',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Regularization',
    targetId: String(req._id),
    meta: { date: req.date, employee: String(req.userId) },
  });
  await notify({
    userId: String(req.userId),
    type: 'attendance.regularization_decided',
    title: `Correction ${approve ? 'approved' : 'rejected'}`,
    body: `Your attendance correction for ${req.date} was ${approve ? 'approved' : 'rejected'}${comment ? `: ${comment}` : ''}.`,
    link: '/attendance',
    email: true,
  });
  return toRegDTO(req);
}

// ---- policy + holidays ----

export async function getPolicy(): Promise<AttendancePolicyDTO> {
  return policyDTO(await getPolicyDoc());
}

export async function updatePolicy(
  actor: AuthUser,
  input: UpdateAttendancePolicyInput,
): Promise<AttendancePolicyDTO> {
  const p = await getPolicyDoc();
  if (input.workdayMinutes !== undefined) p.workdayMinutes = input.workdayMinutes;
  if (input.halfDayMinutes !== undefined) p.halfDayMinutes = input.halfDayMinutes;
  if (input.shiftStart !== undefined) p.shiftStart = input.shiftStart;
  if (input.shiftEnd !== undefined) p.shiftEnd = input.shiftEnd;
  if (input.weekOff !== undefined) {
    // Saturdays (6) and Sundays (0) are always non-working — floor the
    // configurable week-off set so an admin can't remove the weekend.
    p.weekOff = Array.from(new Set([...input.weekOff, 0, 6])).sort((a, b) => a - b);
  }
  if (input.graceMinutes !== undefined) p.graceMinutes = input.graceMinutes;
  if (input.timezone !== undefined) p.timezone = input.timezone;
  if (input.autoAbsentEnabled !== undefined) p.autoAbsentEnabled = input.autoAbsentEnabled;
  if (input.autoAbsentCutoff !== undefined) p.autoAbsentCutoff = input.autoAbsentCutoff;
  if (input.weeklyMinimumMinutes !== undefined) p.weeklyMinimumMinutes = input.weeklyMinimumMinutes;
  await p.save();
  await recordAudit({
    action: 'attendance.policy_updated',
    actorId: actor.id,
    actorLabel: actor.email,
  });
  return policyDTO(p);
}

export async function listHolidays(year?: number): Promise<HolidayDTO[]> {
  const filter = year ? { date: new RegExp(`^${year}`) } : {};
  const docs = await Holiday.find(filter).sort({ date: 1 });
  return docs.map((h) => ({ id: String(h._id), date: h.date, name: h.name }));
}

export async function createHoliday(actor: AuthUser, input: HolidayInput): Promise<HolidayDTO> {
  if (await Holiday.exists({ date: input.date })) {
    throw new ConflictError('A holiday already exists on that date');
  }
  const h = await Holiday.create({ date: input.date, name: input.name });
  await recordAudit({ action: 'attendance.holiday_created', actorId: actor.id, actorLabel: actor.email, meta: { date: input.date } });
  return { id: String(h._id), date: h.date, name: h.name };
}

export async function deleteHoliday(actor: AuthUser, id: string): Promise<void> {
  const h = await Holiday.findById(id);
  if (!h) throw new NotFoundError('Holiday not found');
  await h.deleteOne();
  await recordAudit({ action: 'attendance.holiday_deleted', actorId: actor.id, actorLabel: actor.email, meta: { date: h.date } });
}

// ---- CSV export (team) ----

export async function exportTeamCsv(actor: AuthUser, query: TeamAttendanceQuery): Promise<string> {
  const page = await getTeamAttendance(actor, { ...query, page: 1, pageSize: 1000 });
  const header = 'Date,Employee,Email,Status,CheckIn,CheckOut,WorkedMinutes,OvertimeMinutes';
  const rows = page.items.map((r) =>
    [r.date, r.employeeName, r.email, r.status, r.checkInAt ?? '', r.checkOutAt ?? '', r.workedMinutes, r.overtimeMinutes]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}
