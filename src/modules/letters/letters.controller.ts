import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './letters.service';

export const listHandler = asyncHandler(async (_req, res) => sendOk(res, await service.listLetters()));

export const getHandler = asyncHandler(async (req, res) => sendOk(res, await service.getLetter(req.params.id)));

export const createHandler = asyncHandler(async (req, res) => sendOk(res, await service.createLetter(req.user!, req.body), 201));

export const updateHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateLetter(req.user!, req.params.id, req.body)));

export const deleteHandler = asyncHandler(async (req, res) => {
  await service.deleteLetter(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const pdfHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.getLetterPdf(req.user!, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});
