import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import { XLSX_CONTENT_TYPE } from '../../common/xlsx';
import * as service from './inventoryRequests.service';

type Scope = 'mine' | 'inbox' | 'all';
const scopeOf = (v: unknown): Scope => (v === 'inbox' || v === 'all' ? v : 'mine');

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

// Inventory requests
export const createRequestHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createRequest(req.user!, req.body), 201);
});
export const listRequestsHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listRequests(req.user!, { scope: scopeOf(req.query.scope) }));
});
export const getRequestHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getRequest(req.user!, req.params.id));
});
export const decideRequestHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.decideRequest(req.user!, req.params.id, req.body));
});
export const exportRequestsHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.exportRequests(req.user!, { scope: scopeOf(req.query.scope) });
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});
