import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError, isAppError } from '../common/errors';
import { logger } from '../common/logger';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

/** Terminal error handler — must be the LAST middleware (PLAN.md §12.2). */
export const errorHandler: ErrorRequestHandler = (err, req: Request, res, _next) => {
  let appErr: AppError;

  if (isAppError(err)) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = new AppError(400, 'validation_error', 'Validation failed', err.flatten());
  } else {
    const message = err instanceof Error ? err.message : 'Internal server error';
    appErr = new AppError(500, 'internal_error', message, undefined, false);
  }

  const log = req.log ?? logger;
  if (appErr.statusCode >= 500) {
    log.error({ err }, appErr.message);
  } else {
    log.warn({ code: appErr.code, statusCode: appErr.statusCode }, appErr.message);
  }

  res.status(appErr.statusCode).json({
    error: {
      code: appErr.code,
      message: appErr.statusCode >= 500 && isProd ? 'Internal server error' : appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
    },
  });
};
