import { asyncHandler } from '../../common/asyncHandler';
import { sendOk, sendPage } from '../../common/httpResponse';
import * as service from './employee.service';
import type { ListEmployeesQuery } from '@ems/validation';

export const listEmployeesHandler = asyncHandler(async (req, res) => {
  const result = await service.listEmployees(req.user!, req.query as unknown as ListEmployeesQuery);
  sendPage(res, result.items, result.meta);
});

export const getEmployeeHandler = asyncHandler(async (req, res) => {
  const dto = await service.getEmployee(req.user!, req.params.id);
  sendOk(res, dto);
});

export const createEmployeeHandler = asyncHandler(async (req, res) => {
  const result = await service.createEmployee(req.user!, req.body);
  sendOk(res, result, 201);
});

export const importEmployeesHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.importEmployees(req.user!, req.body.csv), 201);
});

export const updateEmployeeHandler = asyncHandler(async (req, res) => {
  const dto = await service.updateEmployee(req.user!, req.params.id, req.body);
  sendOk(res, dto);
});

export const assignRoleHandler = asyncHandler(async (req, res) => {
  const dto = await service.assignRole(req.user!, req.params.id, req.body);
  sendOk(res, dto);
});

export const deactivateEmployeeHandler = asyncHandler(async (req, res) => {
  await service.deactivateEmployee(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const resendInviteHandler = asyncHandler(async (req, res) => {
  const notify = req.body?.notify !== false; // default: send the email
  const result = await service.resendInvite(req.user!, req.params.id, notify);
  sendOk(res, result);
});
