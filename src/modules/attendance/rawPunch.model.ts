import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One raw punch received from a biometric terminal (ZKTeco ADMS/push).
 *
 * These are the source of truth we keep for audit + dedupe; the per-day
 * Attendance record is DERIVED from them (first punch = check-in, last =
 * check-out). We never clear the device log, so a bug can't lose data — we
 * rely on the `fingerprint` unique index to make re-sent punches idempotent.
 */
const rawPunchSchema = new Schema(
  {
    deviceSerial: { type: String, required: true, index: true },
    /** On-device enrollment id (PIN) the employee punched with. */
    pin: { type: String, required: true, index: true },
    /** The punch instant (device local time resolved to an absolute instant). */
    timestamp: { type: Date, required: true },
    /** Local office-day (YYYY-MM-DD) the punch belongs to, for derivation. */
    dayKey: { type: String, required: true, index: true },
    status: { type: Number }, // raw ZK status byte (often meaningless — see derivation)
    verify: { type: Number }, // how they authenticated (1=finger, 15=face, ...)
    workcode: { type: String },
    /** Resolved employee; null until the PIN is mapped to an EmployeeProfile. */
    matchedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Deterministic dedupe key: serial|pin|ISO-timestamp|status. */
    fingerprint: { type: String, required: true, unique: true },
    /** Original tab-delimited line, for forensic/debugging. */
    raw: { type: String },
  },
  { timestamps: true },
);

rawPunchSchema.index({ matchedUserId: 1, dayKey: 1 });
rawPunchSchema.index({ pin: 1, matchedUserId: 1 });

export type RawPunchDoc = HydratedDocument<InferSchemaType<typeof rawPunchSchema>>;
export const RawPunch = model('RawPunch', rawPunchSchema);
