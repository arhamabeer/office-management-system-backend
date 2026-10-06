import { z } from 'zod';

/** Create/edit a letter (Owner/Admin). It prints on the company letterhead. */
export const letterSchema = z.object({
  title: z.string().trim().min(1).max(140),
  reference: z.string().trim().max(60).optional(),
  letterDate: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().max(140).optional(),
  recipientLines: z.string().trim().max(400).optional(),
  salutation: z.string().trim().max(80).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(12000),
  signatoryName: z.string().trim().max(140).optional(),
  signatoryTitle: z.string().trim().max(140).optional(),
});
export type LetterInput = z.infer<typeof letterSchema>;

export const updateLetterSchema = letterSchema.partial();
export type UpdateLetterInput = z.infer<typeof updateLetterSchema>;
