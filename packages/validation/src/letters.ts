import { z } from 'zod';

/** Create/edit a reusable letter template (Owner/Admin). No recipient, no date. */
export const letterTemplateSchema = z.object({
  title: z.string().trim().min(1).max(140),
  subject: z.string().trim().min(1).max(200),
  salutation: z.string().trim().max(80).optional(),
  body: z.string().trim().min(1).max(12000),
  signatoryName: z.string().trim().max(140).optional(),
  signatoryTitle: z.string().trim().max(140).optional(),
});
export type LetterTemplateInput = z.infer<typeof letterTemplateSchema>;

export const updateLetterTemplateSchema = letterTemplateSchema.partial();
export type UpdateLetterTemplateInput = z.infer<typeof updateLetterTemplateSchema>;

/** A template's content filled in for one recipient, for download or email. */
export const renderLetterSchema = z.object({
  title: z.string().trim().min(1).max(140),
  reference: z.string().trim().max(60).optional(),
  letterDate: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().max(140).optional(),
  recipientLines: z.string().trim().max(400).optional(),
  recipientEmail: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
  salutation: z.string().trim().max(80).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(12000),
  signatoryName: z.string().trim().max(140).optional(),
  signatoryTitle: z.string().trim().max(140).optional(),
});
export type RenderLetterInput = z.infer<typeof renderLetterSchema>;

/** Emailing additionally requires a valid destination address. */
export const emailLetterSchema = renderLetterSchema.extend({
  recipientEmail: z.string().trim().email().max(200),
});
export type EmailLetterInput = z.infer<typeof emailLetterSchema>;
