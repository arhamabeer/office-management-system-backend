import { Types, type HydratedDocument } from 'mongoose';
import type { AuditLogDTO, Paginated } from '@ems/types';
import type { AuditLogQuery } from '@ems/validation';
import { AuditLog, type AuditLogDoc } from '../../models/AuditLog';
import { pageMeta } from '../../common/httpResponse';

function toDTO(a: HydratedDocument<AuditLogDoc>): AuditLogDTO {
  return {
    id: String(a._id),
    actorId: a.actorId ? String(a.actorId) : undefined,
    actorLabel: a.actorLabel ?? undefined,
    action: a.action,
    targetType: a.targetType ?? undefined,
    targetId: a.targetId ?? undefined,
    ip: a.ip ?? undefined,
    meta: (a.meta as Record<string, unknown> | undefined) ?? undefined,
    createdAt: (a.createdAt as Date).toISOString(),
    updatedAt: (a.createdAt as Date).toISOString(),
  };
}

export async function listAuditLogs(query: AuditLogQuery): Promise<Paginated<AuditLogDTO>> {
  const filter: Record<string, unknown> = {};
  if (query.action) {
    filter.action = new RegExp(query.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  if (query.actorId) filter.actorId = new Types.ObjectId(query.actorId);
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = new Date(`${query.from}T00:00:00.000`);
    if (query.to) range.$lte = new Date(`${query.to}T23:59:59.999`);
    filter.createdAt = range;
  }

  const [total, docs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
  ]);
  return { items: docs.map(toDTO), meta: pageMeta(query.page, query.pageSize, total) };
}
