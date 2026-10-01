import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccountType, OrgRole } from '@ems/types';
import { env } from '../../config/env';

export interface AccessPayload {
  sub: string;
  email: string;
  accountType: AccountType;
  orgRole: OrgRole;
}

function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) {
    const n = Number(ttl);
    return Number.isFinite(n) ? n : 900;
  }
  const val = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return val * mult;
}

export function accessTtlSeconds(): number {
  return ttlToSeconds(env.ACCESS_TOKEN_TTL);
}

export function refreshTtlMs(): number {
  return ttlToSeconds(env.REFRESH_TOKEN_TTL) * 1000;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: accessTtlSeconds(),
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return decoded as unknown as AccessPayload & { iat: number; exp: number };
}

/** Opaque refresh/invite/reset token: return the raw value (sent to the client)
 *  and its sha256 hash (stored in the DB). */
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
