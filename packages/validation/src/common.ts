import { z } from 'zod';
import { ACCOUNT_TYPES, ORG_ROLES } from '@ems/types';

/** Reusable Zod primitives shared by server and clients (PLAN.md §3.4). */

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Password strength policy for SET-password flows (invite accept, reset,
 *  change). Login uses a lenient schema so existing passwords still submit. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');

/** The individual rules, exported so clients can render a live checklist. */
export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
  { label: 'A symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const orgRoleSchema = z.enum(ORG_ROLES);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Shape a route validates against. Each part is optional; the `validate`
 * middleware (backend) checks whichever parts are present.
 */
export interface RequestSchema {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}
