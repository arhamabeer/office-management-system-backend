import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './announcement.service';

export const listHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listAnnouncements(req.user!));
});

export const createHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createAnnouncement(req.user!, req.body), 201);
});

export const updateHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateAnnouncement(req.user!, req.params.id, req.body));
});

export const deleteHandler = asyncHandler(async (req, res) => {
  await service.deleteAnnouncement(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const approveHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.approveAnnouncement(req.user!, req.params.id));
});

export const rejectHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.rejectAnnouncement(req.user!, req.params.id, req.body?.note));
});

export const markReadHandler = asyncHandler(async (req, res) => {
  await service.markRead(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const markAllReadHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.markAllRead(req.user!));
});
