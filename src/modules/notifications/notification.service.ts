import type { NotificationDTO, NotificationCountDTO, NotificationPrefsDTO } from '@ems/types';
import type { ListNotificationsQuery } from '@ems/validation';
import { Notification, type NotificationDoc } from './notification.model';
import { User } from '../auth/user.model';
import { NotFoundError } from '../../common/errors';

function toDTO(n: NotificationDoc): NotificationDTO {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body ?? undefined,
    link: n.link ?? undefined,
    read: !!n.read,
    createdAt: (n.createdAt as Date).toISOString(),
  };
}

export async function listMine(userId: string, query: ListNotificationsQuery): Promise<NotificationDTO[]> {
  const filter: Record<string, unknown> = { userId };
  if (query.unread) filter.read = false;
  const docs = await Notification.find(filter).sort({ createdAt: -1 }).limit(query.limit);
  return docs.map(toDTO);
}

export async function unreadCount(userId: string): Promise<NotificationCountDTO> {
  return { unread: await Notification.countDocuments({ userId, read: false }) };
}

export async function markRead(userId: string, id: string): Promise<NotificationDTO> {
  const doc = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { read: true, readAt: new Date() },
    { new: true },
  );
  if (!doc) throw new NotFoundError('Notification not found');
  return toDTO(doc);
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const res = await Notification.updateMany({ userId, read: false }, { read: true, readAt: new Date() });
  return { updated: res.modifiedCount };
}

export async function getPrefs(userId: string): Promise<NotificationPrefsDTO> {
  const user = await User.findById(userId).select('notifyByEmail');
  return { email: user?.notifyByEmail ?? true };
}

export async function updatePrefs(userId: string, email: boolean): Promise<NotificationPrefsDTO> {
  const user = await User.findByIdAndUpdate(userId, { notifyByEmail: email }, { new: true }).select('notifyByEmail');
  if (!user) throw new NotFoundError('User not found');
  return { email: user.notifyByEmail ?? true };
}
