import type { RequestStatus, RequestRouteTarget } from './enums';
import type { RequestTimelineEntryDTO } from './requests';

/** A configurable inventory item category (Stationery, IT Equipment, …). */
export interface InventoryCategoryDTO {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

/** An inventory request and its routing/resolution lifecycle (REQUEST_STATUSES). */
export interface InventoryRequestDTO {
  id: string;
  userId: string;
  employeeName?: string;
  categoryId: string;
  categoryName?: string;
  itemName: string;
  quantity: number;
  neededBy?: string; // YYYY-MM-DD
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
