import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A company-wide announcement. `readBy` tracks who has read it (fine at a
 *  single-org scale; a join collection would be the move for very large orgs). */
const announcementSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    pinned: { type: Boolean, default: false },
    // Manager-posted notices need Operations approval before they publish.
    status: { type: String, enum: ['Published', 'Pending', 'Rejected'], default: 'Published', index: true },
    publishedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    createdById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true },
    readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

announcementSchema.index({ pinned: -1, publishedAt: -1 });

export type AnnouncementDoc = HydratedDocument<InferSchemaType<typeof announcementSchema>>;
export const Announcement = model('Announcement', announcementSchema);
