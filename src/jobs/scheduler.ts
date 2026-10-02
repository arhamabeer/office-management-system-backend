import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../common/logger';
import { runAutoAbsent } from '../modules/attendance/attendance.service';
import { reconcile, checkDeviceSilence } from '../modules/attendance/device.service';

/**
 * Background schedulers. Started once from the server bootstrap (never in tests
 * or from the seed). Each job is self-guarding: the tick just invokes it and the
 * job decides — using the attendance policy — whether it's time to act, so a
 * policy change (cut-off, timezone, enabled flag) takes effect without a restart.
 */

let started = false;
const tasks: ScheduledTask[] = [];

// Every 15 minutes. The auto-absent job only acts once per day, after the
// configured cut-off, on a working day — this cadence just makes it responsive.
const AUTO_ABSENT_CRON = '*/15 * * * *';

// Every 10 minutes. Biometric-device safety net: with ADMS the device re-posts
// buffered punches automatically when we come back up, so this is belt-and-
// braces — it re-derives recent days from stored raw punches (idempotent) and
// warns about any Enabled device that's gone silent.
const DEVICE_SYNC_CRON = '*/10 * * * *';

export function startScheduler(): void {
  if (started) return;
  started = true;

  tasks.push(
    schedule(AUTO_ABSENT_CRON, () => {
      void runAutoAbsent().catch((err) =>
        logger.error({ err: (err as Error).message }, 'auto-absent sweep failed'),
      );
    }),
  );

  tasks.push(
    schedule(DEVICE_SYNC_CRON, () => {
      void reconcile().catch((err) =>
        logger.error({ err: (err as Error).message }, 'device reconcile failed'),
      );
      void checkDeviceSilence().catch((err) =>
        logger.error({ err: (err as Error).message }, 'device silence check failed'),
      );
    }),
  );

  logger.info(
    `scheduler: started (auto-absent "${AUTO_ABSENT_CRON}", device-sync "${DEVICE_SYNC_CRON}")`,
  );
}

/** Stop all scheduled tasks (used for graceful shutdown). */
export async function stopScheduler(): Promise<void> {
  await Promise.all(tasks.map((t) => t.stop()));
  tasks.length = 0;
  started = false;
}
