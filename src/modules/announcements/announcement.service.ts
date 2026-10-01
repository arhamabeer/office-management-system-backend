import { Types } from 'mongoose';
import type { AnnouncementDTO } from '@ems/types';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { Announcement, type AnnouncementDoc } from './announcement.model';
import { User } from '../auth/user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { recordAudit } from '../../middleware/audit';
import { notifyMany } from '../../common/notify';
import { ForbiddenError, NotFoundError } from '../../common/errors';

const isOrgAdmin = (a: AuthUser): boolean => a.accountType === 'Owner' || a.orgRole === 'Admin';

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
    publishedAt: (a.publishedAt as Date).toISOString(),
    expiresAt: a.expiresAt ? (a.expiresAt as Date).toISOString() : undefined,
    authorName,
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

export async function listAnnouncements(actor: AuthUser): Promise<AnnouncementDTO[]> {
  const docs = await Announcement.find(activeFilter()).sort({ pinned: -1, publishedAt: -1 });
  const authorIds = docs.map((d) => d.createdById).filter(Boolean) as Types.ObjectId[];
  const profs = authorIds.length
    ? await EmployeeProfile.find({ userId: { $in: authorIds } }).select('userId firstName lastName')
    : [];
  const nameMap = new Map(profs.map((p) => [String(p.userId), `${p.firstName} ${p.lastName}`.trim()]));
  return docs.map((d) => toDTO(d, actor.id, d.createdById ? nameMap.get(String(d.createdById)) : undefined));
}

export async function createAnnouncement(actor: AuthUser, input: CreateAnnouncementInput): Promise<AnnouncementDTO> {
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only an owner or admin can post announcements');
  const doc = await Announcement.create({
    title: input.title,
    body: input.body,
    pinned: input.pinned ?? false,
    expiresAt: input.expiresAt ?? undefined,
    createdById: new Types.ObjectId(actor.id),
  });
  await recordAudit({
    action: 'announcement.created',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Announcement',
    targetId: String(doc._id),
    meta: { title: input.title },
  });
  // Alert everyone (except the author) via the notification bell.
  const users = await User.find({ status: 'Active' }).select('_id');
  await notifyMany(
    users.map((u) => String(u._id)),
    { type: 'announcement', title: `📢 ${input.title}`, body: input.body.slice(0, 160), link: '/notices' },
    actor.id,
  );
  return toDTO(doc, actor.id, await nameOf(doc.createdById ?? undefined));
}

export async function updateAnnouncement(
  actor: AuthUser,
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AnnouncementDTO> {
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only an owner or admin can edit announcements');
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
  if (input.title !== undefined) doc.title = input.title;
  if (input.body !== undefined) doc.body = input.body;
  if (input.pinned !== undefined) doc.pinned = input.pinned;
  if (input.expiresAt !== undefined) doc.expiresAt = input.expiresAt ?? undefined;
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
  if (!isOrgAdmin(actor)) throw new ForbiddenError('Only an owner or admin can delete announcements');
  const doc = await Announcement.findById(id);
  if (!doc) throw new NotFoundError('Announcement not found');
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

export async function markRead(actor: AuthUser, id: string): Promise<void> {
  const res = await Announcement.updateOne(
    { _id: id },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  if (res.matchedCount === 0) throw new NotFoundError('Announcement not found');
}

export async function markAllRead(actor: AuthUser): Promise<{ updated: number }> {
  const res = await Announcement.updateMany(
    { ...activeFilter(), readBy: { $ne: new Types.ObjectId(actor.id) } },
    { $addToSet: { readBy: new Types.ObjectId(actor.id) } },
  );
  return { updated: res.modifiedCount };
}
