import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Singleton company profile: the configurable details shown on business cards
 *  (company name, website, address, phone, tagline). Seeded with brand defaults. */
const companyProfileSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    companyName: { type: String },
    website: { type: String },
    email: { type: String },
    address: { type: String },
    phone: { type: String },
    tagline: { type: String },
  },
  { timestamps: true },
);

export type CompanyProfileDoc = HydratedDocument<InferSchemaType<typeof companyProfileSchema>>;
export const CompanyProfile = model('CompanyProfile', companyProfileSchema);
