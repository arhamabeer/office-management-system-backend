import type { AuthUserDTO, MeResponse, InviteInfoDTO } from '@ems/types';
import { BRAND } from '@ems/config';
import { User, type UserDoc } from './user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { Department } from '../departments/department.model';
import { hashPassword, verifyPassword } from './password';
import {
  signAccessToken,
  accessTtlSeconds,
  refreshTtlMs,
  generateOpaqueToken,
  hashToken,
  type AccessPayload,
} from './token.service';
import { toAuthUserDTO, toProfileDTO } from '../../common/mappers';
import { recordAudit } from '../../middleware/audit';
import { sendResetEmail } from '../../common/mailer';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../common/errors';
import { env, isProd } from '../../config/env';
import { logger } from '../../common/logger';

export interface AuthContext {
  userAgent?: string;
  ip?: string;
}

// A constant hash used to normalize verify timing on the "no such user / inactive"
// path, so response time doesn't leak account existence.
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword('timing-normalizer');
  return dummyHash;
}

function payloadFor(user: UserDoc): AccessPayload {
  return {
    sub: String(user._id),
    email: user.email,
    accountType: user.accountType,
    orgRole: user.orgRole,
  };
}

/** Prune expired/revoked refresh entries and append a fresh one; returns raw token. */
function issueRefresh(user: UserDoc, ctx: AuthContext): string {
  const now = Date.now();
  const { raw, hash } = generateOpaqueToken();
  const kept = user.refreshTokens
    .filter((t) => !t.revokedAt && t.expiresAt.getTime() > now)
    .map((t) => t.toObject());
  kept.push({
    tokenHash: hash,
    expiresAt: new Date(now + refreshTtlMs()),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  } as (typeof kept)[number]);
  // keep the most recent 10 sessions
  user.set('refreshTokens', kept.slice(-10));
  return raw;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: AuthUserDTO;
  refreshRaw: string;
}

export async function login(
  email: string,
  password: string,
  ctx: AuthContext,
): Promise<AuthResult> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.passwordHash || user.status !== 'Active') {
    await verifyPassword(await getDummyHash(), password); // normalize timing
    throw new UnauthorizedError('Invalid email or password');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new UnauthorizedError('Invalid email or password');

  user.lastLoginAt = new Date();
  const refreshRaw = issueRefresh(user, ctx);
  await user.save();
  await recordAudit({
    action: 'auth.login',
    actorId: String(user._id),
    actorLabel: user.email,
    ip: ctx.ip,
  });

  return {
    accessToken: signAccessToken(payloadFor(user)),
    expiresIn: accessTtlSeconds(),
    user: toAuthUserDTO(user),
    refreshRaw,
  };
}

export async function refresh(rawToken: string | undefined, ctx: AuthContext): Promise<AuthResult> {
  if (!rawToken) throw new UnauthorizedError('Missing refresh token');
  const hash = hashToken(rawToken);
  const user = await User.findOne({ 'refreshTokens.tokenHash': hash });
  if (!user) throw new UnauthorizedError('Invalid session');

  const entry = user.refreshTokens.find((t) => t.tokenHash === hash);
  if (!entry) throw new UnauthorizedError('Invalid session');

  // Reuse detection: a revoked token being presented again → compromise. Revoke all.
  if (entry.revokedAt) {
    user.set('refreshTokens', []);
    await user.save();
    await recordAudit({
      action: 'auth.refresh_reuse_detected',
      actorId: String(user._id),
      actorLabel: user.email,
      ip: ctx.ip,
    });
    throw new UnauthorizedError('Session revoked, please log in again');
  }
  if (entry.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Session expired, please log in again');
  }
  if (user.status !== 'Active') throw new UnauthorizedError('Account inactive');

  // rotate: revoke the presented token, drop expired entries (keeps recent
  // revoked ones for reuse detection), append the new one, and cap the array.
  const now = Date.now();
  const { raw, hash: newHash } = generateOpaqueToken();
  entry.revokedAt = new Date();
  entry.replacedByHash = newHash;
  const kept = user.refreshTokens
    .filter((t) => t.expiresAt.getTime() > now)
    .map((t) => t.toObject());
  kept.push({
    tokenHash: newHash,
    expiresAt: new Date(now + refreshTtlMs()),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  } as (typeof kept)[number]);
  user.set('refreshTokens', kept.slice(-20));
  await user.save();

  return {
    accessToken: signAccessToken(payloadFor(user)),
    expiresIn: accessTtlSeconds(),
    user: toAuthUserDTO(user),
    refreshRaw: raw,
  };
}

export async function logout(rawToken: string | undefined, allDevices = false): Promise<void> {
  if (!rawToken) return;
  const hash = hashToken(rawToken);
  const user = await User.findOne({ 'refreshTokens.tokenHash': hash });
  if (!user) return;
  if (allDevices) {
    user.set('refreshTokens', []);
  } else {
    const entry = user.refreshTokens.find((t) => t.tokenHash === hash);
    if (entry) entry.revokedAt = new Date();
  }
  await user.save();
}

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  const profile = await EmployeeProfile.findOne({ userId: user._id });
  let departmentName: string | undefined;
  if (profile?.departmentId) {
    const dept = await Department.findById(profile.departmentId).select('name');
    departmentName = dept?.name;
  }
  return {
    user: toAuthUserDTO(user),
    profile: profile ? toProfileDTO(profile, user, departmentName) : null,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: AuthContext,
): Promise<string> {
  const user = await User.findById(userId);
  if (!user || !user.passwordHash) throw new NotFoundError('User not found');
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new ValidationError('Current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.set('refreshTokens', []); // log out all sessions
  const refreshRaw = issueRefresh(user, ctx); // keep this session
  await user.save();
  await recordAudit({ action: 'auth.password_changed', actorId: userId, actorLabel: user.email, ip: ctx.ip });
  return refreshRaw;
}

export async function forgotPassword(email: string): Promise<string | null> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    await getDummyHash(); // normalize timing; never reveal existence
    return null;
  }
  const { raw, hash } = generateOpaqueToken();
  user.resetTokenHash = hash;
  user.resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await user.save();
  // Email the reset link (best-effort — never blocks or reveals existence).
  const profile = await EmployeeProfile.findOne({ userId: user._id }).select('firstName');
  const name = profile?.firstName || user.email.split('@')[0];
  const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${raw}`;
  try {
    await sendResetEmail({ to: user.email, name, resetUrl, orgName: BRAND.name });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'forgotPassword: reset email failed');
  }
  // In dev we also return the raw token so the flow is testable without a mailbox.
  return isProd ? null : raw;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hash = hashToken(token);
  const user = await User.findOne({ resetTokenHash: hash });
  if (!user || !user.resetExpiresAt || user.resetExpiresAt.getTime() <= Date.now()) {
    throw new ValidationError('Invalid or expired reset token');
  }
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.resetTokenHash = undefined;
  user.resetExpiresAt = undefined;
  user.set('refreshTokens', []);
  if (user.status === 'Invited') user.status = 'Active';
  await user.save();
  await recordAudit({ action: 'auth.password_reset', actorId: String(user._id), actorLabel: user.email });
}

/** Look up a pending invitation by its raw token — public, for the onboarding
 *  page. Returns only non-secret display fields, and never reveals whether the
 *  failure was a bad vs. expired token. */
export async function getInviteInfo(token: string): Promise<InviteInfoDTO> {
  const user = await User.findOne({ inviteTokenHash: hashToken(token) });
  if (
    !user ||
    user.status !== 'Invited' ||
    !user.inviteExpiresAt ||
    user.inviteExpiresAt.getTime() <= Date.now()
  ) {
    throw new ValidationError('This invitation link is invalid or has expired');
  }
  const profile = await EmployeeProfile.findOne({ userId: user._id }).select('firstName lastName designation');
  return {
    email: user.email,
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    orgRole: user.orgRole,
    accountType: user.accountType,
    designation: profile?.designation ?? undefined,
    orgName: BRAND.productName,
  };
}

export interface AcceptInviteProfile {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export async function acceptInvite(
  token: string,
  password: string,
  ctx: AuthContext,
  profile: AcceptInviteProfile = {},
): Promise<AuthResult> {
  const hash = hashToken(token);
  const user = await User.findOne({ inviteTokenHash: hash });
  if (
    !user ||
    user.status !== 'Invited' ||
    !user.inviteExpiresAt ||
    user.inviteExpiresAt.getTime() <= Date.now()
  ) {
    throw new ValidationError('Invalid or expired invite token');
  }
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  user.status = 'Active';
  user.inviteTokenHash = undefined;
  user.inviteExpiresAt = undefined;
  // Activate the profile and apply any details the invitee completed onboarding with.
  const profileUpdate: Record<string, unknown> = { status: 'Active' };
  if (profile.firstName?.trim()) profileUpdate.firstName = profile.firstName.trim();
  if (profile.lastName?.trim()) profileUpdate.lastName = profile.lastName.trim();
  if (profile.phone?.trim()) profileUpdate.phone = profile.phone.trim();
  await EmployeeProfile.updateOne({ userId: user._id }, profileUpdate);
  const refreshRaw = issueRefresh(user, ctx);
  await user.save();
  await recordAudit({ action: 'auth.invite_accepted', actorId: String(user._id), actorLabel: user.email, ip: ctx.ip });
  return {
    accessToken: signAccessToken(payloadFor(user)),
    expiresIn: accessTtlSeconds(),
    user: toAuthUserDTO(user),
    refreshRaw,
  };
}
