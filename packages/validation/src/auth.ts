import { z } from 'zod';
import { emailSchema, passwordSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Invite acceptance: a first-time user sets their password via an invite token. */
export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
  // Optional profile details the invitee completes during onboarding.
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const inviteTokenParamSchema = z.object({
  token: z.string().min(10),
});
export type InviteTokenParam = z.infer<typeof inviteTokenParamSchema>;
