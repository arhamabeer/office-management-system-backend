import { z } from 'zod';

/** Admin edit of the company details printed on business cards. */
export const updateCompanyProfileSchema = z.object({
  companyName: z.string().trim().min(1).max(80).optional(),
  website: z.string().trim().max(200).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  tagline: z.string().trim().max(120).optional(),
});
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
