import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './businessCard.service';

export const myCardHandler = asyncHandler(async (req, res) => sendOk(res, await service.getMyCard(req.user!)));

export const vcardHandler = asyncHandler(async (req, res) => {
  const { vcard, filename } = await service.getVCard(req.user!);
  res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(vcard);
});

export const cardPdfHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.getCardPdf(req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

export const getCompanyHandler = asyncHandler(async (_req, res) => sendOk(res, await service.getCompanyProfile()));
export const updateCompanyHandler = asyncHandler(async (req, res) => sendOk(res, await service.updateCompanyProfile(req.user!, req.body)));
