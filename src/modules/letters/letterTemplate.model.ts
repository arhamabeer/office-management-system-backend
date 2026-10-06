import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A reusable letter template (Owner/Admin), printed on the company letterhead. */
const letterTemplateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    salutation: { type: String, trim: true },
    body: { type: String, required: true },
    signatoryName: { type: String, trim: true },
    signatoryTitle: { type: String, trim: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type LetterTemplateDoc = HydratedDocument<InferSchemaType<typeof letterTemplateSchema>>;
export const LetterTemplate = model('LetterTemplate', letterTemplateSchema);
