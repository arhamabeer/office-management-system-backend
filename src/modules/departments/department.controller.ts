import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './department.service';

export const listDepartmentsHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.listDepartments());
});

export const createDepartmentHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createDepartment(req.user!, req.body), 201);
});

export const updateDepartmentHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateDepartment(req.user!, req.params.id, req.body));
});

export const deleteDepartmentHandler = asyncHandler(async (req, res) => {
  await service.deleteDepartment(req.user!, req.params.id);
  sendOk(res, { success: true });
});
