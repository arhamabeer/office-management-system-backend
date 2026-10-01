import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import { XLSX_CONTENT_TYPE } from '../../common/xlsx';
import * as service from './expenses.service';

// Categories (config)
export const listCategoriesHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.listCategories());
});
export const createCategoryHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createCategory(req.user!, req.body), 201);
});
export const updateCategoryHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateCategory(req.user!, req.params.id, req.body));
});
export const deactivateCategoryHandler = asyncHandler(async (req, res) => {
  await service.deactivateCategory(req.user!, req.params.id);
  sendOk(res, { success: true });
});

// Policy (config)
export const getPolicyHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.getPolicy());
});
export const updatePolicyHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updatePolicy(req.user!, req.body));
});

// Claims
export const createClaimHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createClaim(req.user!.id, req.body), 201);
});
export const submitClaimHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.submitClaim(req.user!, req.params.id));
});
export const exportClaimsHandler = asyncHandler(async (req, res) => {
  const scope = (req.query.scope as 'mine' | 'pending' | 'team') ?? 'mine';
  const year = req.query.year ? Number(req.query.year) : undefined;
  const { buffer, filename } = await service.exportClaims(req.user!, scope, year);
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});
export const listClaimsHandler = asyncHandler(async (req, res) => {
  const scope = (req.query.scope as 'mine' | 'pending' | 'team') ?? 'mine';
  const year = req.query.year ? Number(req.query.year) : undefined;
  sendOk(res, await service.listClaims(req.user!, scope, year));
});
export const approveClaimHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideClaim(req.user!, req.params.id, true, req.body));
});
export const rejectClaimHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideClaim(req.user!, req.params.id, false, req.body));
});
export const reimburseClaimHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.reimburseClaim(req.user!, req.params.id));
});
