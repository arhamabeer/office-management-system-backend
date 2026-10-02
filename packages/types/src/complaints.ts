import type { RequestStatus, RequestRouteTarget } from './enums';
import type { RequestTimelineEntryDTO } from './requests';

/** A configurable complaint category (Workplace, Facilities, IT, …). */
export interface ComplaintCategoryDTO {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

/** A complaint and its routing/resolution lifecycle (see REQUEST_STATUSES). */
export interface ComplaintDTO {
  id: string;
  userId: string;
  employeeName?: string;
  categoryId: string;
  categoryName?: string;
  subject: string;
  reason: string;
  details?: string;
  status: RequestStatus;
  /** Handler queues currently holding the request (when status 'Forwarded'). */
  routedTo: RequestRouteTarget[];
  resolution?: string;
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  timeline: RequestTimelineEntryDTO[];
  createdAt: string;
  updatedAt: string;
}
