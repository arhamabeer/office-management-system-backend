import type { ApprovalsCountDTO } from '@ems/types';
import type { AuthUser } from '../../middleware/auth';
import { Regularization } from '../attendance/regularization.model';
import { LeaveRequest } from '../leaves/leaveRequest.model';
import { Complaint } from '../complaints/complaint.model';
import { InventoryRequest } from '../inventoryRequests/inventoryRequest.model';
import { scopedUserIds } from '../../common/scope';
import { buildInboxFilter } from '../../common/requestWorkflow';

/**
 * Count the items awaiting the actor's decision, using the SAME scope + status
 * filters as each module's pending list, so the badge always matches what the
 * inboxes show (PLAN.md §9). Leaves/regularizations use the simple Pending+scope
 * filter; complaints/inventory use the shared request-workflow inbox filter
 * (manager-stage items in scope + Operations/Admin handler queues).
 */
export async function countPending(actor: AuthUser): Promise<ApprovalsCountDTO> {
  const { orgWide, ids } = await scopedUserIds(actor);
  const pendingFilter: Record<string, unknown> = { status: 'Pending' };
  if (!orgWide) pendingFilter.userId = { $in: ids };

  const inbox = await buildInboxFilter(actor);

  const [regularizations, leaves, complaints, inventoryRequests] = await Promise.all([
    Regularization.countDocuments(pendingFilter),
    LeaveRequest.countDocuments(pendingFilter),
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
