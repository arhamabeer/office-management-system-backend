import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { corsOptions } from './config/cors';
import { env } from './config/env';
import { logger } from './common/logger';
import { mountSwagger } from './config/swagger';
import { generalRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import apiRoutes from './routes';
import admsRouter from './modules/attendance/device.adms.routes';

/** Build the Express application (no listening/DB side-effects — testable). */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Keep query values as strings (no nested objects), so `?x[$ne]=` can't reach
  // Mongoose as an operator object — defence-in-depth for NoSQL injection.
  app.set('query parser', 'simple');

  // Security & parsing
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Request logging (adds req.log with request-id correlation)
  app.use(pinoHttp({ logger }));

  // API docs (not rate-limited)
  mountSwagger(app);

  // ZKTeco ADMS / push protocol — the biometric device dials out and POSTs
  // punches here directly as plain tab-delimited text (NOT JSON, NOT under /api).
  app.use('/iclock', express.text({ type: () => true, limit: '2mb' }), admsRouter);

  // Versioned API (rate-limited)
  app.use(env.API_PREFIX, generalRateLimiter, apiRoutes);

  // 404 + centralized error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
