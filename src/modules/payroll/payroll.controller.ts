import type { Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import { XLSX_CONTENT_TYPE } from '../../common/xlsx';
import * as service from './payroll.service';

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

// Payroll settings (currency + fiscal year — no tax slabs)
export const getSettingsHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.getSettings());
});
export const updateSettingsHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateSettings(req.user!, req.body));
});

// Tax certificate
export const taxCertificateHandler = asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  sendOk(res, await service.getTaxCertificate(req.user!, req.query.userId as string | undefined, year));
});
export const taxCertificatePdfHandler = asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const { buffer, filename } = await service.getTaxCertificatePdf(req.user!, req.query.userId as string | undefined, year);
  sendPdf(res, buffer, filename);
});

// Salary structure
export const getSalaryHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getSalary(req.user!, req.query.userId as string | undefined));
});
export const setSalaryHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.setSalaryStructure(req.user!, req.params.userId, req.body));
});
export const listSalariesHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listAllSalaries(req.user!));
});
export const exportSalariesHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.exportSalaries(req.user!);
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});

// Payroll runs
export const listRunsHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await service.listRuns());
});
export const runPayrollHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.runPayroll(req.user!, req.body.month), 201);
});
export const finalizeRunHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.finalizeRun(req.user!, req.params.id));
});

// Payslips
export const listPayslipsHandler = asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  sendOk(res, await service.listPayslips(req.user!, req.query.userId as string | undefined, year));
});
export const getPayslipHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getPayslip(req.user!, req.params.id));
});
export const payslipPdfHandler = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.getPayslipPdf(req.user!, req.params.id);
  sendPdf(res, buffer, filename);
});
