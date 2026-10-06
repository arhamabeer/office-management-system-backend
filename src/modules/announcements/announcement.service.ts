import { Types } from 'mongoose';
import type { AnnouncementDTO, AnnouncementStatus } from '@ems/types';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { Announcement, type AnnouncementDoc } from './announcement.model';
import { User } from '../auth/user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { recordAudit } from '../../middleware/audit';
import { notify, notifyMany } from '../../common/notify';
import { ForbiddenError, NotFoundError } from '../../common/errors';

const isOwnerOrAdmin = (a: AuthUser): boolean => a.accountType === 'Owner' || a.orgRole === 'Admin';
/** Can publish directly, approve, edit, pin and delete any notice. */
const canModerate = (a: AuthUser): boolean => isOwnerOrAdmin(a) || a.orgRole === 'Operations';
/** Can post a notice — moderators directly, managers via Operations approval. */
const canPost = (a: AuthUser): boolean => canModerate(a) || a.orgRole === 'Manager';

/** Active = no expiry, or an expiry still in the future. */
function activeFilter(): Record<string, unknown> {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };
}

function toDTO(a: AnnouncementDoc, actorId: string, authorName?: string): AnnouncementDTO {
  return {
    id: String(a._id),
    title: a.title,
    body: a.body,
    pinned: !!a.pinned,
    status: (a.status ?? 'Published') as AnnouncementStatus,
    publishedAt: (a.publishedAt as Date).toISOString(),
    expiresAt: a.expiresAt ? (a.expiresAt as Date).toISOString() : undefined,
    authorName,
    mine: !!a.createdById && String(a.createdById) === actorId,
    decisionNote: a.decisionNote ?? undefined,
    read: a.readBy.some((r) => String(r) === actorId),
    readCount: a.readBy.length,
    createdAt: (a.createdAt as Date).toISOString(),
  };
}

async function nameOf(userId?: Types.ObjectId): Promise<string | undefined> {
  if (!userId) return undefined;
  const p = await EmployeeProfile.findOne({ userId }).select('firstName lastName');
  return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
}

/** Active users who can approve a pending notice (Operations + Owner/Admin). */
async function approverIds(): Promise<string[]> {
  const users = await User.find({
    status: 'Active',
    $or: [{ orgRole: 'Operations' }, { orgRole: 'Admin' }, { accountType: 'Owner' }],
  }).select('_id');
  return users.map((u) => String(u._id));
}

export async function listAnnouncements(actor: AuthUser): Promise<AnnouncementDTO[]> {
  const actorObjId = new Types.ObjectId(actor.id);
  // Everyone sees published, active notices. Moderators also see every pending
  // notice (to approve). Everyone additionally sees their OWN pending/rejected.
  const or: Record<string, unknown>[] = [{ status: 'Published', ...activeFilter() }];
  if (canModerate(actor)) or.push({ status: 'Pending' });
  or.push({ status: { $in: ['Pending', 'Rejected'] }, createdById: actorObjId });

  const docs = await Announcement.find({ $or: or }).sort({ pinned: -1, publishedAt: -1 });
  const authorIds = docs.map((d) => d.createdById).filter(Boolean) as Types.ObjectId[];
  const profs = authorIds.length
    ? await EmployeeProfile.find({ userId: { $in: authorIds } }).select('userId firstName lastName')
    : [];
  const nameMap = new Map(profs.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]));
  return docs.map((d) => toDTO(d, actor.id, d.createdById ? nameMap.get(String(d.createdById)) : undefined));
}

/** Broadcast a freshly published notice to everyone except the author/publisher. */
async function broadcastPublished(doc: AnnouncementDoc, excludeIds: string[]): Promise<void> {
  const users = await User.find({ status: 'Active' }).select('_id');
  const exclude = new Set(excludeIds);
  await notifyMany(
    users.map((u) => String(u._id)).filter((id) => !exclude.has(id)),
    { type: 'announcement', title: `📢 ${doc.title}`, body: doc.body.slice(0, 160), link: '/notices' },
  );
}

export async function createAnnouncement(actor: AuthUser, input: CreateAnnouncementInput): Promise<AnnouncementDTO> {
  if (!canPost(actor)) throw new ForbiddenError('Only admins, operations or managers can post notices');
  const direct = canModerate(actor);
  const doc = await Announcement.create({
    title: input.title,
    body: input.body,
    pinned: input.pinned ?? false,
    expiresAt: input.expiresAt ?? undefined,
    status: direct ? 'Published' : 'Pending',
    publishedAt: new Date(),
    createdById: new Types.ObjectId(actor.id),
  });
  await recordAudit({
    action: direct ? 'announcement.created' : 'announcement.submitted',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: String(doc._id),
    meta: { title: input.title, status: doc.status },
  });

  if (direct) {
    await broadcastPublished(doc, [actor.id]);
  } else {
    // Manager submission — ask the approvers (Operations/Admin/Owner) to review.
    const authorName = (await nameOf(doc.createdById ?? undefined)) ?? actor.email;
    await notifyMany(
      await approverIds(),
      {
        type: 'announcement_pending',
        title: '📝 Notice awaiting approval',
        body: `${authorName} submitted “${input.title}” for review.`,
        link: '/notices',
        email: true,
      },
      actor.id,
    );
  }
  return toDTO(doc, actor.id, await nameOf(doc.createdById ?? undefined));
}

export async function updateAnnouncement(
  actor: AuthUser,
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AnnouncementDTO> {
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
  const isAuthor = !!doc.createdById && String(doc.createdById) === actor.id;
  // Moderators edit anything; an author may still edit their own pending notice.
  if (!canModerate(actor) && !(isAuthor && doc.status === 'Pending')) {
    throw new ForbiddenError('You cannot edit this notice');
  }
  if (input.title !== undefined) doc.title = input.title;
  if (input.body !== undefined) doc.body = input.body;
  // Only moderators control pinning.
  if (input.pinned !== undefined && canModerate(actor)) doc.pinned = input.pinned;
  if (input.expiresAt !== undefined && canModerate(actor)) doc.expiresAt = input.expiresAt ?? undefined;
  await doc.save();
  await recordAudit({
    action: 'announcement.updated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: String(doc._id),
  });
  return toDTO(doc, actor.id, await nameOf(doc.createdById ?? undefined));
}

export async function deleteAnnouncement(actor: AuthUser, id: string): Promise<void> {
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
  const isAuthor = !!doc.createdById && String(doc.createdById) === actor.id;
  // Moderators delete anything; an author may withdraw their own notice while
  // it is still pending or after it was rejected (not once it's published).
  if (!canModerate(actor) && !(isAuthor && doc.status !== 'Published')) {
    throw new ForbiddenError('You cannot delete this notice');
  }
  await doc.deleteOne();
  await recordAudit({
    action: 'announcement.deleted',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: id,
    meta: { title: doc.title },
  });
}

export async function approveAnnouncement(actor: AuthUser, id: string): Promise<AnnouncementDTO> {
  if (!canModerate(actor)) throw new ForbiddenError('Only operations or an admin can approve notices');
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
  if (doc.status !== 'Pending') throw new ForbiddenError('This notice is not awaiting approval');
  doc.status = 'Published';
  doc.publishedAt = new Date();
  doc.decidedById = new Types.ObjectId(actor.id);
  doc.decidedAt = new Date();
  doc.decisionNote = undefined;
  await doc.save();
  await recordAudit({
    action: 'announcement.approved',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: id,
    meta: { title: doc.title },
  });
  const authorId = doc.createdById ? String(doc.createdById) : undefined;
  await broadcastPublished(doc, [actor.id, ...(authorId ? [authorId] : [])]);
  if (authorId) {
    await notify({
      userId: authorId,
      type: 'announcement_approved',
      title: '✅ Your notice was published',
      body: `“${doc.title}” is now live on the notice board.`,
      link: '/notices',
      email: true,
    });
  }
  return toDTO(doc, actor.id, await nameOf(doc.createdById ?? undefined));
}

export async function rejectAnnouncement(actor: AuthUser, id: string, note?: string): Promise<AnnouncementDTO> {
  if (!canModerate(actor)) throw new ForbiddenError('Only operations or an admin can reject notices');
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
  if (doc.status !== 'Pending') throw new ForbiddenError('This notice is not awaiting approval');
  doc.status = 'Rejected';
  doc.decidedById = new Types.ObjectId(actor.id);
  doc.decidedAt = new Date();
  doc.decisionNote = note?.trim() || undefined;
  await doc.save();
  await recordAudit({
    action: 'announcement.rejected',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: id,
    meta: { title: doc.title, note: doc.decisionNote },
  });
  const authorId = doc.createdById ? String(doc.createdById) : undefined;
  if (authorId) {
    await notify({
      userId: authorId,
      type: 'announcement_rejected',
      title: '❌ Your notice was not approved',
      body: note?.trim() ? `“${doc.title}” — ${note.trim()}` : `“${doc.title}” was not approved.`,
      link: '/notices',
      email: true,
    });
  }
  return toDTO(doc, actor.id, await nameOf(doc.createdById ?? undefined));
}

export async function markRead(actor: AuthUser, id: string): Promise<void> {
  const res = await Announcement.updateOne(
    { _id: id },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  if (res.matchedCount === 0) throw new NotFoundError('Announcement not found');
}

export async function markAllRead(actor: AuthUser): Promise<{ updated: number }> {
  const res = await Announcement.updateMany(
    { status: 'Published', ...activeFilter(), readBy: { $ne: new Types.ObjectId(actor.id) } },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  return { updated: res.modifiedCount };
}
