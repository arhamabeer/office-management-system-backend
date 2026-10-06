import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './letters.service';

// ---- templates ----
export const listTemplatesHandler = asyncHandler(async (_req, res) => sendOk(res, await service.listTemplates()));

export const getTemplateHandler = asyncHandler(async (req, res) => sendOk(res, await service.getTemplate(req.params.id)));

export const createTemplateHandler = asyncHandler(async (req, res) => sendOk(res, await service.createTemplate(req.user!, req.body), 201));

export const updateTemplateHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateTemplate(req.user!, req.params.id, req.body)));

export const deleteTemplateHandler = asyncHandler(async (req, res) => {
  await service.deleteTemplate(req.user!, req.params.id);
  sendOk(res, { success: true });
});

// ---- render / email a filled letter ----
export const renderHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.renderLetter(req.user!, req.body);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

export const emailHandler = asyncHandler(async (req, res) => sendOk(res, await service.emailLetter(req.user!, req.body)));
