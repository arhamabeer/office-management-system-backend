import type { Request } from 'express';
import type { LoginResponse } from '@ems/types';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as authService from './auth.service';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from './cookies';

function ctxOf(req: Request): authService.AuthContext {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

export const loginHandler = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const r = await authService.login(email, password, ctxOf(req));
  setRefreshCookie(res, r.refreshRaw);
  const body: LoginResponse = { accessToken: r.accessToken, expiresIn: r.expiresIn, user: r.user };
  sendOk(res, body);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  const r = await authService.refresh(raw, ctxOf(req));
  setRefreshCookie(res, r.refreshRaw);
  const body: LoginResponse = { accessToken: r.accessToken, expiresIn: r.expiresIn, user: r.user };
  sendOk(res, body);
});

export const logoutHandler = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  await authService.logout(raw, req.query.all === 'true');
  clearRefreshCookie(res);
  sendOk(res, { success: true });
});

export const meHandler = asyncHandler(async (req, res) => {
  const me = await authService.getMe(req.user!.id);
  sendOk(res, me);
});

export const changePasswordHandler = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  const raw = await authService.changePassword(req.user!.id, currentPassword, newPassword, ctxOf(req));
  setRefreshCookie(res, raw);
  sendOk(res, { success: true });
});

export const forgotPasswordHandler = asyncHandler(async (req, res) => {
  const devToken = await authService.forgotPassword(req.body.email);
  sendOk(res, { success: true, ...(devToken ? { devToken } : {}) });
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  sendOk(res, { success: true });
});

export const inviteInfoHandler = asyncHandler(async (req, res) => {
  sendOk(res, await authService.getInviteInfo(req.params.token));
});

export const acceptInviteHandler = asyncHandler(async (req, res) => {
  const { token, password, firstName, lastName, phone } = req.body;
  const r = await authService.acceptInvite(token, password, ctxOf(req), { firstName, lastName, phone });
  setRefreshCookie(res, r.refreshRaw);
  const body: LoginResponse = { accessToken: r.accessToken, expiresIn: r.expiresIn, user: r.user };
  sendOk(res, body);
});
