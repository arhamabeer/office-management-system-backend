import type { AttendanceStatus } from '@ems/types';

export interface PolicyLike {
  workdayMinutes: number;
  halfDayMinutes: number;
  weekOff: number[];
}

/** Local calendar day key YYYY-MM-DD for a Date. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Calendar day key (YYYY-MM-DD) for an instant in a given IANA timezone.
 *  en-CA formats as YYYY-MM-DD, so the parts are already in the right order. */
export function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Minutes since local midnight for an instant in a given IANA timezone. */
export function minutesInTz(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (hour % 24) * 60 + minute;
}

/** Parse "HH:MM" into minutes since midnight (returns 0 on a malformed value). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD calendar date, timezone-agnostic. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** All YYYY-MM-DD day keys in a YYYY-MM month. */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let day = 1; day <= count; day++) {
    out.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

/**
 * Resolve a biometric device's LOCAL wall-clock time string ("YYYY-MM-DD
 * HH:MM:SS", in the office `tz`) to an absolute instant (Date). ZK terminals
 * emit local time with no offset, so we must interpret it in the office
 * timezone — treating it as UTC would silently shift days. Pure JS (no tz lib):
 * build the naive-UTC instant, measure the zone's offset there, and subtract it.
 */
export function parseDeviceLocalTime(local: string, tz: string): Date {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Unparseable device time: "${local}"`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(naiveUtc));
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  // hour can come back as '24' at midnight in some runtimes — normalise.
  const hour = Number(p.hour) % 24;
  const tzAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  const offset = tzAsUtc - naiveUtc; // how far `tz` is ahead of UTC at this instant
  return new Date(naiveUtc - offset);
}

/** Format a UTC Date's calendar parts as YYYY-MM-DD. */
function utcDayKey(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift a YYYY-MM-DD calendar date by `n` days (timezone-agnostic). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return utcDayKey(new Date(Date.UTC(y, m - 1, d + n)));
}

/** The Monday (YYYY-MM-DD) of the week containing `dateStr`. Weeks run Mon–Sun. */
export function weekStartOf(dateStr: string): string {
  const daysSinceMonday = (weekdayOf(dateStr) + 6) % 7; // Mon->0 ... Sun->6
  return addDays(dateStr, -daysSinceMonday);
}

/** The Sunday (YYYY-MM-DD) ending the week containing `dateStr`. */
export function weekEndOf(dateStr: string): string {
  return addDays(weekStartOf(dateStr), 6);
}

/** All YYYY-MM-DD day keys from `start` to `end` inclusive (start ≤ end). */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWeekOff(dateStr: string, policy: PolicyLike): boolean {
  return policy.weekOff.includes(weekdayOf(dateStr));
}

/** Status for a COMPLETED day given minutes worked. */
export function deriveStatus(workedMinutes: number, policy: PolicyLike): AttendanceStatus {
  if (workedMinutes >= policy.workdayMinutes) return 'Present';
  return 'HalfDay';
}

export function overtimeMinutes(workedMinutes: number, policy: PolicyLike): number {
  return Math.max(0, workedMinutes - policy.workdayMinutes);
}
