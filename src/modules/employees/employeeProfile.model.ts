import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { EMPLOYMENT_TYPES, USER_STATUSES } from '@ems/types';

/** HR/profile data for a user (1:1 with User) — PLAN.md §7.
 *  Designation, department, joiningDate, employmentType are data fields, not roles. */
const employeeProfileSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeCode: { type: String, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'FullTime' },
    joiningDate: { type: Date },
    reportsToId: { type: Schema.Types.ObjectId, ref: 'User' },
    leadId: { type: Schema.Types.ObjectId, ref: 'User' },
    phone: { type: String, trim: true },
    status: { type: String, enum: USER_STATUSES, default: 'Invited' },
  },
  { timestamps: true },
);

employeeProfileSchema.index({ departmentId: 1 });
employeeProfileSchema.index({ reportsToId: 1 });
employeeProfileSchema.index({ leadId: 1 });

export type EmployeeProfileDoc = HydratedDocument<InferSchemaType<typeof employeeProfileSchema>>;
export const EmployeeProfile = model('EmployeeProfile', employeeProfileSchema);
