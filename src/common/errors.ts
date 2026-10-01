/** Typed application errors (PLAN.md §12.2). Services throw these; the terminal
 *  error middleware maps them to a consistent JSON envelope. */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(400, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, 'conflict', message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, 'rate_limited', message);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
