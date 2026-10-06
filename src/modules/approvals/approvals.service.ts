import type { ApprovalsCountDTO } from '@ems/types';
import type { AuthUser } from '../../middleware/auth';
import { Regularization } from '../attendance/regularization.model';
import { LeaveRequest } from '../leaves/leaveRequest.model';
import { Complaint } from '../complaints/complaint.model';
import { InventoryRequest } from '../inventoryRequests/inventoryRequest.model';
import { buildInboxFilter, buildPendingInboxFilter } from '../../common/requestWorkflow';

/**
 * Count the items awaiting the actor's decision, using the SAME scope + status
 * filters as each module's pending list, so the badge always matches what the
 * inboxes show (PLAN.md §9). Leaves/regularizations use the Pending inbox filter
 * (manager-stage items in scope, not yet forwarded, + the Operations/Admin
 * queues the actor staffs); complaints/inventory use the Submitted/Forwarded one.
 */
export async function countPending(actor: AuthUser): Promise<ApprovalsCountDTO> {
  const pendingInbox = await buildPendingInboxFilter(actor);
  const inbox = await buildInboxFilter(actor);

  const [regularizations, leaves, complaints, inventoryRequests] = await Promise.all([
    Regularization.countDocuments(pendingInbox),
    LeaveRequest.countDocuments(pendingInbox),
    Complaint.countDocuments(inbox),
    InventoryRequest.countDocuments(inbox),
  ]);

  return {
    regularizations,
    leaves,
    complaints,
    inventoryRequests,
    total: regularizations + leaves + complaints + inventoryRequests,
  };
}
