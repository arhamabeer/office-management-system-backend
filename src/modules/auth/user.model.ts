import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ACCOUNT_TYPES, ORG_ROLES, USER_STATUSES } from '@ems/types';

/** A single rotating refresh-token record (stored hashed) — PLAN.md §12.1. */
const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedByHash: { type: String },
    userAgent: { type: String },
    ip: { type: String },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } },
);

/** User = authentication identity + the two role dimensions (PLAN.md §7).
 *  HR/profile data lives on EmployeeProfile (1:1). */
const userSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    accountType: { type: String, enum: ACCOUNT_TYPES, required: true, default: 'Employee' },
    orgRole: { type: String, enum: ORG_ROLES, required: true, default: 'Member' },
    status: { type: String, enum: USER_STATUSES, required: true, default: 'Invited' },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    passwordChangedAt: { type: Date },
    inviteTokenHash: { type: String },
    inviteExpiresAt: { type: Date },
    resetTokenHash: { type: String },
    resetExpiresAt: { type: Date },
    lastLoginAt: { type: Date },
    // Opt-out of email for notifications (in-app notifications are always on).
    notifyByEmail: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
