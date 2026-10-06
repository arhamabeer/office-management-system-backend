import { z } from 'zod';

const title = z.string().trim().min(1).max(140);
const body = z.string().trim().min(1).max(5000);
// Accept a date or ISO string; empty/undefined clears it.
const expiry = z.coerce.date().optional().nullable();

export const createAnnouncementSchema = z.object({
  title,
  body,
  pinned: z.boolean().optional(),
  expiresAt: expiry,
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
    pinned: z.boolean().optional(),
    expiresAt: expiry,
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

/** Reject a pending (manager-posted) notice, with an optional reason. */
export const rejectAnnouncementSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type RejectAnnouncementInput = z.infer<typeof rejectAnnouncementSchema>;
