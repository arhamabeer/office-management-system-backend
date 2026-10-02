import { z } from 'zod';
import { REQUEST_ACTIONS } from '@ems/types';

/**
 * Body for a decision on a routable request (complaint / inventory request),
 * at either the manager stage or a handler stage. The service enforces which
 * actions are valid for the request's current status and the actor's role.
 */
export const requestDecisionSchema = z.object({
  action: z.enum(REQUEST_ACTIONS),
  note: z.string().trim().max(1000).optional(),
});
export type RequestDecisionInput = z.infer<typeof requestDecisionSchema>;

/** List scope for request inboxes: own submissions, actionable inbox, or all (admin). */
export const requestScopeQuerySchema = z.object({
  scope: z.enum(['mine', 'inbox', 'all']).default('mine'),
});
export type RequestScopeQuery = z.infer<typeof requestScopeQuerySchema>;
