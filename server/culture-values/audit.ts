/**
 * Culture Values — Audit Logging
 */

import { getDb } from "../db/connection";
import { cvAuditLog } from "../../drizzle/tables/culture-values";

export const CV_AUDIT_ACTIONS = [
  "value_set.create", "value_set.update", "value_set.publish", "value_set.status_change",
  "value_definition.create", "value_definition.update", "value_definition.status_change",
  "behavior.create", "behavior.update", "behavior.delete",
  "non_negotiable.create", "non_negotiable.update", "non_negotiable.delete",
  "translation.create", "translation.update", "translation.delete",
  "operationalization.create", "operationalization.update", "operationalization.delete",
] as const;

export type CvAuditAction = typeof CV_AUDIT_ACTIONS[number];

export async function logCvAudit(params: {
  workspaceId: number;
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
    await db.insert(cvAuditLog).values({
      workspaceId: params.workspaceId,
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
    console.warn(`[CvAudit] Failed to log ${params.action}: ${(err as Error).message}`);
  }
}
