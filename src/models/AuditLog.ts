import { Schema, model, type InferSchemaType } from 'mongoose';

/** Append-only audit trail for sensitive actions (PLAN.md §12.3).
 *  Never updated or deleted through the API. */
const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorLabel: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },
    ip: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
