/**
 * PS Module — Audit Logging
 */

import { getDb } from "../db/connection";
import { psAuditLog } from "../../drizzle/tables/ps";

export const PS_AUDIT_ACTIONS = [
  "system.create",
  "system.update",
  "system.status_change",
  "wizard_run.create",
  "resource_request.create",
  "resource_request.status_change",
  "demand.generate",
  "resource_assignment.create",
  "resource_assignment.update",
  "resource_assignment.status_change",
  "resource_assignment.delete",
] as const;

export type PsAuditAction = (typeof PS_AUDIT_ACTIONS)[number];

export async function logPsAudit(params: {
  actorId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  category?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(psAuditLog).values({
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      previousValue: params.previousValue,
      newValue: params.newValue,
      category: params.category ?? "mutation",
      metadata: params.metadata,
    });
  } catch (err) {
    console.warn(`[PsAudit] Failed to log ${params.action}: ${(err as Error).message}`);
  }
}
