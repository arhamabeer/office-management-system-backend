import type { Response } from 'express';
import type { PageMeta, Paginated } from '@ems/types';

/** Send the standard success envelope `{ data }` (PLAN.md §8). */
export function sendOk<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function sendPage<T>(
  res: Response,
  items: T[],
  meta: PageMeta,
  status = 200,
): Response {
  const body: Paginated<T> = { items, meta };
  return res.status(status).json({ data: body });
}
