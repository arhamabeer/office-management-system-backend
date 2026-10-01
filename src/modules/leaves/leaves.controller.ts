import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import { XLSX_CONTENT_TYPE } from '../../common/xlsx';
import * as service from './leaves.service';

export const listTypesHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.listTypes());
});
export const createTypeHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createType(req.user!, req.body), 201);
});
export const updateTypeHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateType(req.user!, req.params.id, req.body));
});
export const deactivateTypeHandler = asyncHandler(async (req, res) => {
  await service.deactivateType(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const getPolicyHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.getPolicy());
});
export const updatePolicyHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updatePolicy(req.user!, req.body));
});

export const balancesHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getBalances(req.user!.id, req.query.year ? Number(req.query.year) : undefined));
});

export const applyHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.applyLeave(req.user!.id, req.body), 201);
});

export const exportRequestsHandler = asyncHandler(async (req, res) => {
  const scope = (req.query.scope as 'mine' | 'pending' | 'team') ?? 'mine';
  const year = req.query.year ? Number(req.query.year) : undefined;
  const { buffer, filename } = await service.exportRequests(req.user!, scope, year);
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});
export const listRequestsHandler = asyncHandler(async (req, res) => {
  const scope = (req.query.scope as 'mine' | 'pending' | 'team') ?? 'mine';
  const year = req.query.year ? Number(req.query.year) : undefined;
  sendOk(res, await service.listRequests(req.user!, scope, year));
});

export const calendarHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getTeamCalendar(req.user!, req.query.month as string | undefined));
});

export const cancelHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.cancelRequest(req.user!, req.params.id));
});
export const approveHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideRequest(req.user!, req.params.id, true, req.body.comment));
});
export const rejectHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideRequest(req.user!, req.params.id, false, req.body.comment));
});
