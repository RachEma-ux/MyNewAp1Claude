/**
 * Organization Management Service — module-owned business logic
 *
 * Extracted so both the tRPC router mutations and the public-API
 * gateway actions (`om.entity.create`, `om.position.assign`) call
 * the same code path.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  omLegalEntities,
  omPositions,
} from "../../drizzle/tables/organization-management";
import { logOmAudit } from "./audit";
import { logActivity } from "../modules/registry";
import {
  validateLegalEntityRef,
  validateOrgUnitRef,
} from "./validation";
import { requireOrgUnitNotFrozen, requirePositionOperable } from "./enforcement";

// ── Legal entity create ──────────────────────────────────────────────────

export interface CreateLegalEntityInput {
  workspaceId: number;
  code: string;
  name: string;
  type?: "company" | "subsidiary" | "branch" | "holding";
  parentEntityId?: number;
  country?: string;
  registrationNumber?: string;
  metadata?: Record<string, unknown>;
}

export async function createLegalEntity(
  input: CreateLegalEntityInput,
  actorId?: number,
) {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  if (input.parentEntityId) {
    await validateLegalEntityRef(input.workspaceId, input.parentEntityId);
  }

  const [created] = await db
    .insert(omLegalEntities)
    .values({
      workspaceId: input.workspaceId,
      code: input.code,
      name: input.name,
      type: input.type ?? "company",
      parentEntityId: input.parentEntityId,
      country: input.country,
      registrationNumber: input.registrationNumber,
      metadata: input.metadata,
      createdBy: actorId,
    })
    .returning();

  await logOmAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "legal_entity.create",
    entityType: "legal_entity",
    entityId: created.id,
    newValue: { code: input.code, name: input.name, type: created.type },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "om",
    actorId,
    action: "legal_entity.create",
    targetType: "legal_entity",
    targetId: created.id,
  });

  return created;
}

// ── Position assignment (reassign-org-unit) ──────────────────────────────

export interface AssignPositionInput {
  workspaceId: number;
  positionId: number;
  orgUnitId: number;
}

/**
 * Assign a position to an org unit. Validates the org unit exists,
 * isn't frozen, and that the position is operable. Audit-logs the
 * change as `position.reassign_org_unit` (matching the router's
 * action key when orgUnitId changes during a position update).
 */
export async function assignPositionToOrgUnit(
  input: AssignPositionInput,
  actorId?: number,
) {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(omPositions)
    .where(
      and(
        eq(omPositions.id, input.positionId),
        eq(omPositions.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error(`Position ${input.positionId} not found`);

  await requirePositionOperable(input.workspaceId, input.positionId);
  await validateOrgUnitRef(input.workspaceId, input.orgUnitId);
  await requireOrgUnitNotFrozen(input.workspaceId, input.orgUnitId);

  const [updated] = await db
    .update(omPositions)
    .set({ orgUnitId: input.orgUnitId, updatedAt: new Date() })
    .where(eq(omPositions.id, input.positionId))
    .returning();

  await logOmAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "position.reassign_org_unit",
    entityType: "position",
    entityId: input.positionId,
    previousValue: { orgUnitId: existing.orgUnitId },
    newValue: { orgUnitId: input.orgUnitId },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "om",
    actorId,
    action: "position.reassign_org_unit",
    targetType: "position",
    targetId: input.positionId,
    metadata: { from: existing.orgUnitId, to: input.orgUnitId },
  });

  return updated;
}
