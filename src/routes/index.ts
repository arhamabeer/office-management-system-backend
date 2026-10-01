import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes';
import authRoutes from '../modules/auth/auth.routes';
import employeeRoutes from '../modules/employees/employee.routes';
import departmentRoutes from '../modules/departments/department.routes';
import attendanceRoutes from '../modules/attendance/attendance.routes';
import leaveRoutes from '../modules/leaves/leaves.routes';
import payrollRoutes from '../modules/payroll/payroll.routes';
import auditRoutes from '../modules/audit/audit.routes';
import approvalsRoutes from '../modules/approvals/approvals.routes';
import expenseRoutes from '../modules/expenses/expenses.routes';
import teamRoutes from '../modules/teams/team.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import announcementRoutes from '../modules/announcements/announcement.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes); // M1
router.use('/employees', employeeRoutes); // M1
router.use('/departments', departmentRoutes); // M1
router.use('/attendance', attendanceRoutes); // M2
router.use('/leaves', leaveRoutes); // M3
router.use('/approvals', approvalsRoutes); // unified approvals inbox (badge count)
router.use('/payroll', payrollRoutes); // M4 (salary, payslips, settings + certificate)
router.use('/expenses', expenseRoutes); // expense claims (categories, policy, claims workflow)
router.use('/teams', teamRoutes); // explicit many-to-many teams (augment RBAC scope)
router.use('/notifications', notificationRoutes); // in-app notifications (bell)
router.use('/announcements', announcementRoutes); // company-wide announcements / notices
router.use('/audit-logs', auditRoutes); // M5 (audit trail viewer)
//   /audit-logs · /config · /feature-flags   (cross-cutting / console hooks)

export default router;
