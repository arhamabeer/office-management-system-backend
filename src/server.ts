import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './common/logger';
import { verifyMailTransport } from './common/mailer';
import { startScheduler, stopScheduler } from './jobs/scheduler';

async function bootstrap(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`EMS API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
    if (env.SWAGGER_ENABLED) {
      logger.info(`Swagger UI: http://localhost:${env.PORT}/api/docs`);
    }
    // Non-blocking mail self-check (logs SMTP auth OK/FAILED).
    void verifyMailTransport();
    // Background jobs (auto-absent sweep, etc.).
    startScheduler();
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`);
    void stopScheduler();
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

void bootstrap();
