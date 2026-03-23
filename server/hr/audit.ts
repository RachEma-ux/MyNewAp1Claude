/**
 * HR Audit — Enhanced audit logging for HR module (Phase 5)
 *
 * Supports mutation logging, sensitive-read logging, and audit categories.
 */

import { getDb } from "../db/connection";
import { hrAuditLog } from "../../drizzle/schema";

export type HrAuditCategory =
  | "mutation"
  | "sensitive_read"
  | "status_change"
  | "assignment"
  | "approval"
  | "export"
  | "system";

export interface HrAuditParams {
  actorId?: number;
  workspaceId?: number;
  targetWorkerId?: number;
  action: string;
  category?: HrAuditCategory;
  metadata?: Record<string, unknown>;
}

/**
 * Log an HR audit event. Non-blocking — catches and warns on failure.
 */
export async function logHrAudit(params: HrAuditParams): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(hrAuditLog).values({
      actorId: params.actorId,
      workspaceId: params.workspaceId,
      targetWorkerId: params.targetWorkerId,
      action: params.action,
      metadata: {
        ...params.metadata,
        ...(params.category ? { _category: params.category } : {}),
        _ts: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn(`[HR Audit] Failed to log: ${(err as Error).message}`);
  }
}

/**
 * Log a sensitive-data read (compensation, relations, talent).
 * Tracks who accessed restricted data.
 */
export async function logSensitiveRead(params: {
  actorId: number;
  workspaceId?: number;
  targetWorkerId?: number;
  domain: string;
  recordCount?: number;
}): Promise<void> {
  return logHrAudit({
    actorId: params.actorId,
    workspaceId: params.workspaceId,
    targetWorkerId: params.targetWorkerId,
    action: `hr.${params.domain}.sensitive_read`,
    category: "sensitive_read",
    metadata: {
      domain: params.domain,
      recordCount: params.recordCount,
    },
  });
}

/**
 * Log a status transition (state machine change).
 */
export async function logStatusChange(params: {
  actorId: number;
  workspaceId?: number;
  targetWorkerId?: number;
  domain: string;
  entityId: number;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  return logHrAudit({
    actorId: params.actorId,
    workspaceId: params.workspaceId,
    targetWorkerId: params.targetWorkerId,
    action: `hr.${params.domain}.status_change`,
    category: "status_change",
    metadata: {
      entityId: params.entityId,
      from: params.fromStatus,
      to: params.toStatus,
    },
  });
}
