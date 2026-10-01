import { Schema, model, type InferSchemaType } from 'mongoose';

/** Lightweight in-app notifications (PLAN.md §7). Fully wired in later modules. */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);
