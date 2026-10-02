/** Pending-approval counts for the current approver, scoped to their team
 *  (Owner/Admin see the whole org). Powers the sidebar badge and the inbox. */
export interface ApprovalsCountDTO {
  regularizations: number;
  leaves: number;
  complaints: number;
  inventoryRequests: number;
  total: number;
}
