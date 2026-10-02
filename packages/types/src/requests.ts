import type { RequestTimelineAction, RequestRouteTarget } from './enums';

/**
 * One entry in a routable request's immutable action history. Shared by
 * complaints and inventory requests; every file/forward/resolve/reject appends
 * one, and the whole timeline is returned to the filer so they can follow it.
 */
export interface RequestTimelineEntryDTO {
  at: string;
  byId: string;
  byName?: string;
  byRole: string;
  action: RequestTimelineAction;
  note?: string;
  routedTo?: RequestRouteTarget[];
}
