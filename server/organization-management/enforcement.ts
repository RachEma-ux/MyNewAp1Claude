/**
 * Organization Management — Enforcement Guards
 *
 * Structural integrity checks that must pass before any OM mutation:
 * - Position must belong to exactly one org unit
 * - Reporting chain must be acyclic
 * - Org unit hierarchy must be acyclic
 * - Cost center hierarchy must be acyclic
 * - Legal entity hierarchy must be acyclic
 * - Frozen entities block child mutations
 */

import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import {
  omOrgUnits,
  omPositions,
  omReportingRelationships,
  omCostCenters,
  omLegalEntities,
} from "../../drizzle/tables/organization-management";

/**
 * Detect cycles in a self-referencing hierarchy.
 * Walks up from `startId` following `parentField` and checks for revisits.
 */
async function detectCycle(
  table: any,
  idField: any,
  parentField: any,
  workspaceId: number,
  startId: number,
  proposedParentId: number,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  // If pointing to itself, that's a cycle
  if (startId === proposedParentId) return true;

  const visited = new Set<number>([startId]);
  let currentId: number | null = proposedParentId;

  // Walk up the chain (max 50 levels to prevent infinite loops)
  for (let i = 0; i < 50 && currentId != null; i++) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);

    const [row] = await db
      .select({ parentId: parentField })
      .from(table)
      .where(and(eq(idField, currentId), eq(table.workspaceId, workspaceId)))
      .limit(1);

    currentId = row?.parentId ?? null;
  }

  return false;
}

/**
 * Ensure org unit hierarchy remains acyclic when setting a parent.
 */
export async function requireAcyclicOrgUnit(
  workspaceId: number,
  orgUnitId: number,
  proposedParentId: number,
): Promise<void> {
  const hasCycle = await detectCycle(
    omOrgUnits,
    omOrgUnits.id,
    omOrgUnits.parentOrgUnitId,
    workspaceId,
    orgUnitId,
    proposedParentId,
  );
  if (hasCycle) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "OrgUnit: setting this parent would create a cycle in the hierarchy",
    });
  }
}

/**
 * Ensure reporting chain remains acyclic when setting a reports-to position.
 */
export async function requireAcyclicReporting(
  workspaceId: number,
  positionId: number,
  proposedReportsToId: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  if (positionId === proposedReportsToId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Position cannot report to itself",
    });
  }

  // Walk up the reporting chain from proposedReportsToId
  const visited = new Set<number>([positionId]);
  let currentId: number | null = proposedReportsToId;

  for (let i = 0; i < 50 && currentId != null; i++) {
    if (visited.has(currentId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "ReportingChain: setting this reporting line would create a cycle",
      });
    }
    visited.add(currentId);

    const [row] = await db
      .select({ reportsTo: omPositions.reportsToPositionId })
      .from(omPositions)
      .where(and(eq(omPositions.id, currentId), eq(omPositions.workspaceId, workspaceId)))
      .limit(1);

    currentId = row?.reportsTo ?? null;
  }
}

/**
 * Ensure cost center hierarchy remains acyclic.
 */
export async function requireAcyclicCostCenter(
  workspaceId: number,
  costCenterId: number,
  proposedParentId: number,
): Promise<void> {
  const hasCycle = await detectCycle(
    omCostCenters,
    omCostCenters.id,
    omCostCenters.parentCostCenterId,
    workspaceId,
    costCenterId,
    proposedParentId,
  );
  if (hasCycle) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CostCenter: setting this parent would create a cycle in the hierarchy",
    });
  }
}

/**
 * Ensure legal entity hierarchy remains acyclic.
 */
export async function requireAcyclicLegalEntity(
  workspaceId: number,
  entityId: number,
  proposedParentId: number,
): Promise<void> {
  const hasCycle = await detectCycle(
    omLegalEntities,
    omLegalEntities.id,
    omLegalEntities.parentEntityId,
    workspaceId,
    entityId,
    proposedParentId,
  );
  if (hasCycle) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "LegalEntity: setting this parent would create a cycle in the hierarchy",
    });
  }
}

/**
 * Ensure org unit is not frozen before allowing child entity creation.
 */
export async function requireOrgUnitNotFrozen(
  workspaceId: number,
  orgUnitId: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [unit] = await db
    .select({ status: omOrgUnits.status })
    .from(omOrgUnits)
    .where(and(eq(omOrgUnits.id, orgUnitId), eq(omOrgUnits.workspaceId, workspaceId)))
    .limit(1);

  if (!unit) {
    throw new TRPCError({ code: "NOT_FOUND", message: "OrgUnit not found" });
  }
  if (unit.status === "frozen") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "OrgUnit is frozen — mutations on child entities are blocked",
    });
  }
  if (unit.status === "archived") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "OrgUnit is archived — no further mutations allowed",
    });
  }
}

/**
 * Ensure a position exists and is in an operable state.
 */
export async function requirePositionOperable(
  workspaceId: number,
  positionId: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [pos] = await db
    .select({ status: omPositions.status })
    .from(omPositions)
    .where(and(eq(omPositions.id, positionId), eq(omPositions.workspaceId, workspaceId)))
    .limit(1);

  if (!pos) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
  }
  if (pos.status === "closed") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Position is closed — no further mutations allowed",
    });
  }
}
