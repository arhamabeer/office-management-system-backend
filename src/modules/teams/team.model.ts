import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** An explicit, many-to-many grouping of people. A team has one or more leads
 *  (who, with Owner/Admin, manage its membership) and any number of members.
 *  Team membership augments RBAC scope (see common/scope.ts). */
const teamSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    leadIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    memberIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

teamSchema.index({ leadIds: 1 });
teamSchema.index({ memberIds: 1 });

export type TeamDoc = HydratedDocument<InferSchemaType<typeof teamSchema>>;
export const Team = model('Team', teamSchema);
