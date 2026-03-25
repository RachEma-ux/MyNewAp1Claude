/**
 * Organization Management — Audit Logging
 *
 * Dedicated audit trail for all OM structural mutations.
 * Non-blocking — catches and warns on failure (same pattern as HR audit).
 */

import { getDb } from "../db/connection";
import { omAuditLog } from "../../drizzle/tables/organization-management";

export type OmAuditCategory = "mutation" | "status_change" | "authority" | "structure_publish";

export type OmEntityType =
  | "legal_entity"
  | "org_unit"
  | "job"
  | "position"
  | "reporting_relationship"
  | "cost_center"
  | "structure_version";

export const OM_AUDIT_ACTIONS = [
  // Legal entities
  "legal_entity.create",
  "legal_entity.update",
  "legal_entity.status_change",
  // Org units
  "org_unit.create",
  "org_unit.update",
  "org_unit.status_change",
  "org_unit.reparent",
  // Jobs
  "job.create",
  "job.update",
  "job.status_change",
  // Positions
  "position.create",
  "position.update",
  "position.status_change",
  "position.reassign_org_unit",
  "position.reassign_job",
  "position.change_reporting",
  // Reporting relationships
  "reporting.create",
  "reporting.update",
  "reporting.status_change",
  // Cost centers
  "cost_center.create",
  "cost_center.update",
  "cost_center.status_change",
  // Structure versions
  "structure_version.create",
  "structure_version.publish",
  "structure_version.archive",
  // Authority
  "authority.resolve",
  "authority.chain_query",
] as const;

export type OmAuditAction = typeof OM_AUDIT_ACTIONS[number];

export interface OmAuditParams {
  workspaceId: number;
  actorId?: number;
  action: string;
  entityType: OmEntityType;
  entityId?: number;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  category?: OmAuditCategory;
  metadata?: Record<string, unknown>;
}

/**
 * Log an OM audit event. Non-blocking — catches and warns on failure.
 */
export async function logOmAudit(params: OmAuditParams): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(omAuditLog).values({
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
    console.warn(`[OmAudit] Failed to log ${params.action}: ${(err as Error).message}`);
  }
}
