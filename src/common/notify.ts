import { Notification } from '../modules/notifications/notification.model';
import { User } from '../modules/auth/user.model';
import { EmployeeProfile } from '../modules/employees/employeeProfile.model';
import { sendNotificationEmail } from './mailer';
import { BRAND } from '@ems/config';
import { env } from '../config/env';
import { logger } from './logger';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
  /** Also email the recipient (respecting their notifyByEmail preference). */
  email?: boolean;
}

/** Email the recipient about this notification if they haven't opted out. */
async function maybeEmail(input: NotifyInput): Promise<void> {
  const user = await User.findById(input.userId).select('email notifyByEmail');
  if (!user?.email || user.notifyByEmail === false) return;
  const profile = await EmployeeProfile.findOne({ userId: input.userId }).select('firstName');
  const name = profile?.firstName || user.email.split('@')[0];
  await sendNotificationEmail({
    to: user.email,
    name,
    title: input.title,
    body: input.body ?? input.title,
    orgName: BRAND.name,
    actionUrl: input.link ? `${env.WEB_ORIGIN}${input.link}` : undefined,
    actionLabel: 'Open',
  });
}

/** Create an in-app notification (and optionally an email). Best-effort: the
 *  in-app notification is independent of the email, and neither throws into the
 *  triggering action (approve, submit, …). */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, type: input.type }, 'notify: failed to create');
    return;
  }
  if (input.email) {
    try {
      await maybeEmail(input);
    } catch (err) {
      logger.error({ err: (err as Error).message, type: input.type }, 'notify: email failed');
    }
  }
}

/** Notify several recipients of the same thing (deduped, self excluded). */
export async function notifyMany(
  userIds: (string | undefined | null)[],
  input: Omit<NotifyInput, 'userId'>,
  exclude?: string,
): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id && id !== exclude))];
  await Promise.all(unique.map((userId) => notify({ ...input, userId })));
}
