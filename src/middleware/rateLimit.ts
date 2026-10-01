import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const message = {
  error: { code: 'rate_limited', message: 'Too many requests, please try again later.' },
};

/** General API limiter (PLAN.md §12.4). */
export const generalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/**
 * Stricter limiter for auth endpoints (used from M1). Only FAILED requests
 * count against the cap (skipSuccessfulRequests), so a legitimate user who logs
 * in correctly is never throttled — only repeated failures (brute-force) are.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: { code: 'rate_limited', message: 'Too many attempts, please try again later.' },
  },
});
