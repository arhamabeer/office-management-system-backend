import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Organizational unit with a materialized ancestor path for subtree scoping
 *  (used by Manager "team = department subtree" RBAC — PLAN.md §9). */
const departmentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    ancestors: { type: [Schema.Types.ObjectId], default: [] },
    managerId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

departmentSchema.index({ parentId: 1 });

export type DepartmentDoc = HydratedDocument<InferSchemaType<typeof departmentSchema>>;
export const Department = model('Department', departmentSchema);
