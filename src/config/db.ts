import mongoose from 'mongoose';
import type { DbConnectionState } from '@ems/types';
import { env } from './env';
import { logger } from '../common/logger';

mongoose.set('strictQuery', true);

export function dbState(): DbConnectionState {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 0:
      return 'disconnected';
    default:
      return 'unknown';
  }
}

let listenersBound = false;
function bindConnectionListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
}

/**
 * Connect to MongoDB. Intentionally NON-FATAL on initial failure: the API still
 * boots (so /health and Swagger work) and DB-backed routes surface errors until
 * a database becomes available. (PLAN.md M0 "How to test".)
 */
export async function connectDb(): Promise<void> {
  bindConnectionListeners();
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    logger.error(
      { err },
      'Initial MongoDB connection failed — API will start, but DB-backed routes will error until a database is available.',
    );
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
