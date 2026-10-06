import type { Request } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk, sendPage } from '../../common/httpResponse';
import * as service from './attendance.service';
import type {
  TeamAttendanceQuery,
  RosterQuery,
  AttendanceReportQuery,
  AttendanceReportExportQuery,
  PersonWeeksQuery,
} from '@ems/validation';

const teamQuery = (req: Request) => req.query as unknown as TeamAttendanceQuery;

export const checkInHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.checkIn(req.user!.id, req.body, { ip: req.ip }), 201);
});

export const checkOutHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.checkOut(req.user!.id, req.body));
});

export const myAttendanceHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getMyAttendance(req.user!.id, req.query.month as string | undefined));
});

export const teamAttendanceHandler = asyncHandler(async (req, res) => {
  const result = await service.getTeamAttendance(req.user!, teamQuery(req));
  sendPage(res, result.items, result.meta);
});

export const rosterHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getRoster(req.user!, req.query as unknown as RosterQuery));
});

export const runAutoAbsentHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.runAutoAbsent(req.body, req.user!));
});

export const reportHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getAttendanceReport(req.user!, req.query as unknown as AttendanceReportQuery));
});

export const personWeeksHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getPersonWeeks(req.user!, req.params.userId, req.query as unknown as PersonWeeksQuery));
});

export const reportExportHandler = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await service.getReportExport(
    req.user!,
    req.query as unknown as AttendanceReportExportQuery,
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

export const exportTeamHandler = asyncHandler(async (req, res) => {
  const csv = await service.exportTeamCsv(req.user!, teamQuery(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
  res.status(200).send(csv);
});

export const adminEntryHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.adminEntry(req.user!, req.body), 201);
});

export const getPolicyHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.getPolicy());
});

export const updatePolicyHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updatePolicy(req.user!, req.body));
});

export const listHolidaysHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listHolidays(req.query.year ? Number(req.query.year) : undefined));
});

export const createHolidayHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createHoliday(req.user!, req.body), 201);
});

export const deleteHolidayHandler = asyncHandler(async (req, res) => {
  await service.deleteHoliday(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const createRegularizationHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createRegularization(req.user!.id, req.body), 201);
});

export const listRegularizationsHandler = asyncHandler(async (req, res) => {
  const scope = (req.query.scope as 'mine' | 'pending') ?? 'mine';
  sendOk(res, await service.listRegularizations(req.user!, scope));
});

export const approveRegularizationHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideRegularization(req.user!, req.params.id, true, req.body.comment));
});

export const rejectRegularizationHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideRegularization(req.user!, req.params.id, false, req.body.comment));
});

export const forwardRegularizationHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.forwardRegularization(req.user!, req.params.id, req.body.comment));
});
