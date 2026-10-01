import { Types } from 'mongoose';
import type { AuthUser } from '../middleware/auth';
import { EmployeeProfile } from '../modules/employees/employeeProfile.model';
import { Department } from '../modules/departments/department.model';
import { Team } from '../modules/teams/team.model';
import { User } from '../modules/auth/user.model';

/** Deduplicate ObjectIds by their string form, preserving order. */
function dedupe(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    const k = String(id);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

/** Resolve the set of user ids visible to `actor` per the RBAC scope model
 *  (PLAN.md §9). `orgWide: true` means no restriction (Owner/Admin).
 *
 *  Explicit Teams augment (union with) the reporting-line/department scope: a
 *  user additionally sees everyone in any team they lead. */
export async function scopedUserIds(
  actor: AuthUser,
): Promise<{ orgWide: boolean; ids: Types.ObjectId[] }> {
  if (actor.accountType === 'Owner' || actor.orgRole === 'Admin') return { orgWide: true, ids: [] };
  const selfId = new Types.ObjectId(actor.id);
  const base: Types.ObjectId[] = [selfId];

  if (actor.orgRole === 'Manager') {
    const managed = await Department.find({ managerId: selfId }).select('_id');
    const managedIds = managed.map((d) => d._id);
    const descendants = managedIds.length
      ? await Department.find({ ancestors: { $in: managedIds } }).select('_id')
      : [];
    const deptIds = [...managedIds, ...descendants.map((d) => d._id)];
    const or: Record<string, unknown>[] = [{ reportsToId: selfId }, { leadId: selfId }];
    if (deptIds.length) or.push({ departmentId: { $in: deptIds } });
    const profs = await EmployeeProfile.find({ $or: or }).select('userId');
    base.push(...profs.map((p) => p.userId));
  } else if (actor.orgRole === 'Lead') {
    const profs = await EmployeeProfile.find({
      $or: [{ leadId: selfId }, { reportsToId: selfId }],
    }).select('userId');
    base.push(...profs.map((p) => p.userId));
  }

  // Union: everyone in a team this actor leads (applies to every non-org-wide
  // role, so a team lead sees their team even without a reporting relationship).
  const ledTeams = await Team.find({ leadIds: selfId }).select('memberIds');
  for (const t of ledTeams) base.push(...t.memberIds);

  const ids = dedupe(base);

  // Owners and Admins sit above team/manager scope: a non-org-wide actor never
  // gains visibility into an Owner/Admin's records, even if one is a member of
  // a team they lead. (The actor themselves is always kept.)
  const privileged = await User.find({
    _id: { $in: ids },
    $or: [{ accountType: 'Owner' }, { orgRole: 'Admin' }],
  }).select('_id');
  const privSet = new Set(privileged.map((u) => String(u._id)));
  const visible = ids.filter((id) => String(id) === actor.id || !privSet.has(String(id)));

  return { orgWide: false, ids: visible };
}
