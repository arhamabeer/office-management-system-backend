import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One in-app notification for a single recipient. Append-only from the app's
 *  side; the recipient only flips `read`. */
const notificationSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    link: { type: String },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

export type NotificationDoc = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const Notification = model('Notification', notificationSchema);
