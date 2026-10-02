import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { requestWorkflowFields } from '../../common/requestWorkflow';

/** A complaint filed by any employee, routed through the shared request workflow
 *  (manager → Operations/Admin). Lifecycle fields come from requestWorkflowFields. */
const complaintSchema = new Schema(
  {
    ...requestWorkflowFields,
    categoryId: { type: Schema.Types.ObjectId, ref: 'ComplaintCategory', required: true, index: true },
    subject: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export type ComplaintDoc = HydratedDocument<InferSchemaType<typeof complaintSchema>>;
export const Complaint = model('Complaint', complaintSchema);
