/** Base and cross-cutting entity shapes present from M0. Module-specific
 *  entities (EmployeeProfile, Attendance, Leave*, Salary*, etc.) are added
 *  alongside their modules in M1–M4. */

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type DbConnectionState = 'connected' | 'connecting' | 'disconnected' | 'unknown';

export interface HealthStatus {
  status: 'ok';
  uptimeSec: number;
  timestamp: string;
  db: DbConnectionState;
  version: string;
  env: string;
}

export interface FeatureFlagDTO {
  key: string;
  enabled: boolean;
  description?: string;
}

export interface AppConfigDTO {
  key: string;
  value: unknown;
  description?: string;
}

export interface AuditLogDTO extends BaseEntity {
  actorId?: string;
  actorLabel?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}
