import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { BIOMETRIC_DEVICE_STATUSES } from '@ems/types';

/**
 * A biometric terminal (keyed by its serial number) that talks to us over the
 * ZKTeco ADMS/push protocol. A device first seen on the wire is auto-registered
 * as 'Pending' — its punches are stored but NOT turned into attendance until an
 * admin 'Enabled's it, so an unknown/rogue device can't inject attendance.
 */
const biometricDeviceSchema = new Schema(
  {
    serial: { type: String, required: true, unique: true },
    label: { type: String, trim: true },
    status: { type: String, enum: BIOMETRIC_DEVICE_STATUSES, default: 'Pending' },
    /** Last time the device checked in (handshake / command poll) — heartbeat. */
    lastSeenAt: { type: Date },
    /** Last time the device delivered a punch. */
    lastPunchAt: { type: Date },
    punchCount: { type: Number, default: 0 },
    firmware: { type: String },
    ipHint: { type: String },
  },
  { timestamps: true },
);

export type BiometricDeviceDoc = HydratedDocument<InferSchemaType<typeof biometricDeviceSchema>>;
export const BiometricDevice = model('BiometricDevice', biometricDeviceSchema);
