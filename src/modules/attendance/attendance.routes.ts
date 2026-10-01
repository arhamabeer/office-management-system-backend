import { Router } from 'express';
import {
  checkInSchema,
  checkOutSchema,
  monthQuerySchema,
  teamAttendanceQuerySchema,
  rosterQuerySchema,
  autoAbsentRunSchema,
  attendanceReportQuerySchema,
  attendanceReportExportQuerySchema,
  personWeeksQuerySchema,
  userIdParamSchema,
  adminEntrySchema,
  updateAttendancePolicySchema,
  holidaySchema,
  yearQuerySchema,
  regularizationCreateSchema,
  regularizationListQuerySchema,
  regularizationDecisionSchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './attendance.controller';

const router = Router();
router.use(requireAuth);

// Self
router.post('/check-in', validate({ body: checkInSchema }), c.checkInHandler);
router.post('/check-out', validate({ body: checkOutSchema }), c.checkOutHandler);
router.get('/me', validate({ query: monthQuerySchema }), c.myAttendanceHandler);

// Team (scope enforced in the service)
router.get('/team', validate({ query: teamAttendanceQuerySchema }), c.teamAttendanceHandler);
router.get('/team/export', validate({ query: teamAttendanceQuerySchema }), c.exportTeamHandler);
// Today's roster: every in-scope employee incl. those not checked in (Lead+ in service)
router.get('/roster', validate({ query: rosterQuerySchema }), c.rosterHandler);
// Period reports + per-person weekly drill-down + downloadable report (Lead+ in service)
router.get('/report', validate({ query: attendanceReportQuerySchema }), c.reportHandler);
router.get('/report/export', validate({ query: attendanceReportExportQuerySchema }), c.reportExportHandler);
router.get('/person/:userId/weeks', validate({ params: userIdParamSchema, query: personWeeksQuerySchema }), c.personWeeksHandler);

// Admin manual entry
router.post('/', authorize({ minOrgRole: 'Admin' }), validate({ body: adminEntrySchema }), c.adminEntryHandler);
// Auto-absent sweep (Admin/Owner) — normally scheduled; can be run on demand.
router.post('/auto-absent/run', authorize({ minOrgRole: 'Admin' }), validate({ body: autoAbsentRunSchema }), c.runAutoAbsentHandler);

// Policy
router.get('/policy', c.getPolicyHandler);
router.put('/policy', authorize({ minOrgRole: 'Admin' }), validate({ body: updateAttendancePolicySchema }), c.updatePolicyHandler);

// Holidays
router.get('/holidays', validate({ query: yearQuerySchema }), c.listHolidaysHandler);
router.post('/holidays', authorize({ minOrgRole: 'Admin' }), validate({ body: holidaySchema }), c.createHolidayHandler);
router.delete('/holidays/:id', authorize({ minOrgRole: 'Admin' }), validate({ params: idParamSchema }), c.deleteHolidayHandler);

// Regularization
router.post('/regularizations', validate({ body: regularizationCreateSchema }), c.createRegularizationHandler);
router.get('/regularizations', validate({ query: regularizationListQuerySchema }), c.listRegularizationsHandler);
router.patch('/regularizations/:id/approve', validate({ params: idParamSchema, body: regularizationDecisionSchema }), c.approveRegularizationHandler);
router.patch('/regularizations/:id/reject', validate({ params: idParamSchema, body: regularizationDecisionSchema }), c.rejectRegularizationHandler);

export default router;
