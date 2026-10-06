import type { LeaveRequestStatus, RequestRouteTarget } from './enums';

export interface LeaveTypeDTO {
  id: string;
  name: string;
  code: string;
  defaultQuota: number;
  paid: boolean;
  requiresApproval: boolean;
  color?: string;
}

export interface LeavePolicyDTO {
  leaveYear: 'calendar' | 'fiscal';
  accrualMode: 'upfront' | 'monthly';
  carryForwardCap: number;
  encashment: boolean;
  probationMonths: number;
  probationSickOnly: boolean;
  twoStepApproval: boolean;
}

export interface LeaveBalanceDTO {
  typeId: string;
  typeName: string;
  code: string;
  paid: boolean;
  entitled: number;
  carriedForward: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface LeaveRequestDTO {
  id: string;
  userId: string;
  employeeName?: string;
  typeId: string;
  typeName: string;
  code: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  /** Handler queues this request has been forwarded to (empty = manager stage). */
  routedTo: RequestRouteTarget[];
  approverId?: string;
  decidedById?: string;
  decidedAt?: string;
  comment?: string;
  createdAt: string;
}
