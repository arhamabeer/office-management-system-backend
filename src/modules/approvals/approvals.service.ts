import type { ApprovalsCountDTO } from '@ems/types';
import type { AuthUser } from '../../middleware/auth';
import { Regularization } from '../attendance/regularization.model';
import { LeaveRequest } from '../leaves/leaveRequest.model';
import { scopedUserIds } from '../../common/scope';

/**
 * Count the items awaiting the actor's decision, using the SAME scope + status
 * filter as the regularization and leave-request pending lists, so the badge
 * always matches what the inbox shows (PLAN.md §9).
 */
export async function countPending(actor: AuthUser): Promise<ApprovalsCountDTO> {
  const { orgWide, ids } = await scopedUserIds(actor);
  const filter: Record<string, unknown> = { status: 'Pending' };
  if (!orgWide) filter.userId = { $in: ids };
  const [regularizations, leaves] = await Promise.all([
    Regularization.countDocuments(filter),
    LeaveRequest.countDocuments(filter),
  ]);
  return { regularizations, leaves, total: regularizations + leaves };
}
