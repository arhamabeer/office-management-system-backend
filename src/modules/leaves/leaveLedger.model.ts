import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Per-(user, leave type, year) reservation counter — the authoritative
 * concurrency gate for the paid-leave quota (PLAN.md §7).
 *
 * `reserved` is the total days currently held by this user's Pending + Approved
 * requests for the type/year. It is mutated with an atomic conditional
 * `findOneAndUpdate` in {@link applyLeave}, so two concurrent applications
 * cannot both pass the quota check and double-spend the allowance. A
 * single-document update is atomic and isolated in MongoDB even on a standalone
 * `mongod`, so this needs no multi-document transaction / replica set — the
 * same primitive the attendance model uses (unique index + upsert).
 */
const leaveLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    typeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    reserved: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

// The unique key is the concurrency primitive: exactly one ledger row per
// (user, type, year), so the conditional $inc serialises the quota gate.
leaveLedgerSchema.index({ userId: 1, typeId: 1, year: 1 }, { unique: true });

export type LeaveLedgerDoc = HydratedDocument<InferSchemaType<typeof leaveLedgerSchema>>;
export const LeaveLedger = model('LeaveLedger', leaveLedgerSchema);
