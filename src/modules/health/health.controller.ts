import type { Request, Response } from 'express';
import type { HealthStatus } from '@ems/types';
import { dbState } from '../../config/db';
import { env } from '../../config/env';

export function getHealth(_req: Request, res: Response): void {
  const db = dbState();
  const payload: HealthStatus = {
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db,
    version: process.env.npm_package_version ?? '0.0.0',
    env: env.NODE_ENV,
  };
  // 503 when the database is unavailable so load balancers / orchestrators
  // treat the instance as unhealthy (the body still reports the detail).
  res.status(db === 'connected' ? 200 : 503).json({ data: payload });
}
