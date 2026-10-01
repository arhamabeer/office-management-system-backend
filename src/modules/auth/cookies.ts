import type { Response } from 'express';
import { env, isProd } from '../../config/env';
import { refreshTtlMs } from './token.service';

export const REFRESH_COOKIE = 'ems_rt';
const cookiePath = `${env.API_PREFIX}/auth`;

/** httpOnly refresh cookie, scoped to the auth routes (PLAN.md §12.1).
 *  SameSite=Strict (the web talks to the API same-origin via the Next proxy) so
 *  the cookie is never sent on cross-site requests — CSRF protection for the
 *  refresh/logout endpoints. `secure` is off in dev so it works over
 *  http://localhost. */
export function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: cookiePath,
    maxAge: refreshTtlMs(),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: cookiePath,
  });
}
