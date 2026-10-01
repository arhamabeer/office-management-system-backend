import type { RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { RequestSchema } from '@ems/validation';
import { ValidationError } from '../common/errors';

/** Validate request body/params/query against shared Zod schemas (PLAN.md §3.4).
 *  Parsed (and coerced) values are written back onto the request. */
export const validate =
  (schema: RequestSchema): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.params) {
        const parsed = schema.params.parse(req.params) as Record<string, string>;
        Object.assign(req.params, parsed);
      }
      if (schema.query) {
        const parsed = schema.query.parse(req.query) as Record<string, unknown>;
        for (const key of Object.keys(req.query)) {
          delete (req.query as Record<string, unknown>)[key];
        }
        Object.assign(req.query, parsed);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Validation failed', err.flatten()));
        return;
      }
      next(err);
    }
  };
