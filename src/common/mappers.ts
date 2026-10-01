import type { AuthUserDTO, EmployeeProfileDTO, AccountType, OrgRole, EmploymentType, UserStatus } from '@ems/types';
import type { UserDoc } from '../modules/auth/user.model';
import type { EmployeeProfileDoc } from '../modules/employees/employeeProfile.model';

export function toAuthUserDTO(u: UserDoc): AuthUserDTO {
  return {
    id: String(u._id),
    email: u.email,
    accountType: u.accountType as AccountType,
    orgRole: u.orgRole as OrgRole,
    status: u.status as UserStatus,
  };
}

export function toProfileDTO(
  p: EmployeeProfileDoc,
  u: UserDoc,
  departmentName?: string,
): EmployeeProfileDTO {
  return {
    id: String(p._id),
    userId: String(u._id),
    email: u.email,
    accountType: u.accountType as AccountType,
    orgRole: u.orgRole as OrgRole,
    status: u.status as UserStatus,
    employeeCode: p.employeeCode ?? undefined,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`.trim(),
    designation: p.designation ?? undefined,
    departmentId: p.departmentId ? String(p.departmentId) : undefined,
    departmentName,
    employmentType: (p.employmentType ?? 'FullTime') as EmploymentType,
    joiningDate: p.joiningDate ? p.joiningDate.toISOString() : undefined,
    reportsToId: p.reportsToId ? String(p.reportsToId) : undefined,
    leadId: p.leadId ? String(p.leadId) : undefined,
    phone: p.phone ?? undefined,
  };
}
