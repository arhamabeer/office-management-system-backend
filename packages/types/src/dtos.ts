import type { AccountType, OrgRole } from './roles';
import type { EmploymentType, UserStatus } from './enums';

/** Auth principal returned by the API (never includes secrets). */
export interface AuthUserDTO {
  id: string;
  email: string;
  accountType: AccountType;
  orgRole: OrgRole;
  status: UserStatus;
}

/** Public details of a pending invitation, for the onboarding page (no secrets). */
export interface InviteInfoDTO {
  email: string;
  firstName: string;
  lastName: string;
  orgRole: OrgRole;
  accountType: AccountType;
  designation?: string;
  orgName: string;
}

export interface EmployeeProfileDTO {
  id: string;
  userId: string;
  email: string;
  accountType: AccountType;
  orgRole: OrgRole;
  status: UserStatus;
  employeeCode?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  designation?: string;
  departmentId?: string;
  departmentName?: string;
  employmentType: EmploymentType;
  joiningDate?: string;
  reportsToId?: string;
  leadId?: string;
  phone?: string;
}

export interface MeResponse {
  user: AuthUserDTO;
  profile: EmployeeProfileDTO | null;
}

export interface LoginResponse {
  accessToken: string;
  /** access-token lifetime in seconds */
  expiresIn: number;
  user: AuthUserDTO;
}

export interface DepartmentDTO {
  id: string;
  name: string;
  code?: string;
  parentId?: string;
  managerId?: string;
}

/** Result of a bulk employee CSV import. */
export interface EmployeeImportResultDTO {
  created: number;
  failed: { line: number; email: string; error: string }[];
}
