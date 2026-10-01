import type { CorsOptions } from 'cors';
import { corsOrigins } from './env';

/** Strict CORS with an explicit allow-list (PLAN.md §12.4). Requests without an
 *  Origin header (same-origin, curl, mobile native) are allowed. */
export const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (!origin || corsOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
};
