import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A configurable inventory item category (Stationery, IT Equipment, …).
 *  Editable on Inventory → Settings; seeded with sensible defaults. */
const inventoryCategorySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type InventoryCategoryDoc = HydratedDocument<InferSchemaType<typeof inventoryCategorySchema>>;
export const InventoryCategory = model('InventoryCategory', inventoryCategorySchema);
