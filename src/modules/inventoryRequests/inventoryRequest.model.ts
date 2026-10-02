import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { requestWorkflowFields } from '../../common/requestWorkflow';

/** An inventory request filed by any employee, routed through the shared request
 *  workflow (manager → Operations/Admin). Request + approval only (no stock). */
const inventoryRequestSchema = new Schema(
  {
    ...requestWorkflowFields,
    categoryId: { type: Schema.Types.ObjectId, ref: 'InventoryCategory', required: true, index: true },
    itemName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    neededBy: { type: String }, // YYYY-MM-DD (optional)
  },
  { timestamps: true },
);

export type InventoryRequestDoc = HydratedDocument<InferSchemaType<typeof inventoryRequestSchema>>;
export const InventoryRequest = model('InventoryRequest', inventoryRequestSchema);
