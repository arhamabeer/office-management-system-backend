import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A letter composed by an Owner/Admin, printed on the company letterhead. */
const letterSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    reference: { type: String, trim: true },
    letterDate: { type: String, trim: true },
    recipientName: { type: String, trim: true },
    recipientLines: { type: String },
    salutation: { type: String, trim: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    signatoryName: { type: String, trim: true },
    signatoryTitle: { type: String, trim: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type LetterDoc = HydratedDocument<InferSchemaType<typeof letterSchema>>;
export const Letter = model('Letter', letterSchema);
