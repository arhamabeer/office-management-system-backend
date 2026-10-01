import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './notification.service';
import type { ListNotificationsQuery } from '@ems/validation';

export const listHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listMine(req.user!.id, req.query as unknown as ListNotificationsQuery));
});

export const countHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.unreadCount(req.user!.id));
});

export const markReadHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.markRead(req.user!.id, req.params.id));
});

export const markAllReadHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.markAllRead(req.user!.id));
});

export const getPrefsHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getPrefs(req.user!.id));
});

export const updatePrefsHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updatePrefs(req.user!.id, req.body.email));
});
