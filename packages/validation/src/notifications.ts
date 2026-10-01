import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unread: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'))
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const updateNotificationPrefsSchema = z.object({ email: z.boolean() });
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;
