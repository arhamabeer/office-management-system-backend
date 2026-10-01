import { Router } from 'express';
import {
  updatePayrollSettingsSchema,
  taxCertificateQuerySchema,
  setSalaryStructureSchema,
  createPayrollRunSchema,
  payslipQuerySchema,
  salaryQuerySchema,
  userIdParamSchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './payroll.controller';

const router = Router();
router.use(requireAuth);

// Payroll settings (Owner/Admin to edit)
router.get('/settings', c.getSettingsHandler);
router.put('/settings', authorize({ minOrgRole: 'Admin' }), validate({ body: updatePayrollSettingsSchema }), c.updateSettingsHandler);

// Tax certificate (self, or Owner/Admin for others via ?userId) — service-audited
router.get('/tax/certificate', validate({ query: taxCertificateQuerySchema }), c.taxCertificateHandler);
router.get('/tax/certificate/pdf', validate({ query: taxCertificateQuerySchema }), c.taxCertificatePdfHandler);

// Salary structure
router.get('/salaries', authorize({ minOrgRole: 'Admin' }), c.listSalariesHandler);
router.get('/salaries/export', authorize({ minOrgRole: 'Admin' }), c.exportSalariesHandler);
router.get('/salary', validate({ query: salaryQuerySchema }), c.getSalaryHandler);
router.put(
  '/salary/:userId',
  authorize({ minOrgRole: 'Admin' }),
  validate({ params: userIdParamSchema, body: setSalaryStructureSchema }),
  c.setSalaryHandler,
);

// Payroll runs (Owner/Admin)
router.get('/runs', authorize({ minOrgRole: 'Admin' }), c.listRunsHandler);
router.post('/runs', authorize({ minOrgRole: 'Admin' }), validate({ body: createPayrollRunSchema }), c.runPayrollHandler);
router.post('/runs/:id/finalize', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.finalizeRunHandler);

// Payslips (self or Owner/Admin — enforced + audited in the service)
router.get('/payslips', validate({ query: payslipQuerySchema }), c.listPayslipsHandler);
router.get('/payslips/:id', validate({ params: idParamSchema }), c.getPayslipHandler);
router.get('/payslips/:id/pdf', validate({ params: idParamSchema }), c.payslipPdfHandler);

export default router;
