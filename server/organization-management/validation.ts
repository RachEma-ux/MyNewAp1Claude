/**
 * Organization Management — Structural Validation
 *
 * Validates structural integrity rules:
 * - Position must reference valid org unit
 * - Position must reference valid job (if set)
 * - Reporting relationship positions must exist in same workspace
 * - Org unit must reference valid legal entity (if set)
 * - Code uniqueness enforcement
 */

import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import {
  omOrgUnits,
  omPositions,
  omJobs,
  omLegalEntities,
  omCostCenters,
  omAlignmentMatrixVersions,
  omAlignmentTypes,
  omAlignmentAttributes,
  omAlignmentCells,
  omStructureVersions,
} from "../../drizzle/tables/organization-management";

/**
 * Validate that a referenced org unit exists and is active within the workspace.
 */
export async function validateOrgUnitRef(workspaceId: number, orgUnitId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [unit] = await db
    .select({ id: omOrgUnits.id, status: omOrgUnits.status })
    .from(omOrgUnits)
    .where(and(eq(omOrgUnits.id, orgUnitId), eq(omOrgUnits.workspaceId, workspaceId)))
    .limit(1);

  if (!unit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced org unit (id=${orgUnitId}) does not exist in this workspace`,
    });
  }
  if (unit.status === "archived") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced org unit (id=${orgUnitId}) is archived`,
    });
  }
}

/**
 * Validate that a referenced job exists and is active within the workspace.
 */
export async function validateJobRef(workspaceId: number, jobId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [job] = await db
    .select({ id: omJobs.id, status: omJobs.status })
    .from(omJobs)
    .where(and(eq(omJobs.id, jobId), eq(omJobs.workspaceId, workspaceId)))
    .limit(1);

  if (!job) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced job (id=${jobId}) does not exist in this workspace`,
    });
  }
  if (job.status === "retired") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced job (id=${jobId}) is retired`,
    });
  }
}

/**
 * Validate that a referenced position exists within the workspace.
 */
export async function validatePositionRef(workspaceId: number, positionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [pos] = await db
    .select({ id: omPositions.id })
    .from(omPositions)
    .where(and(eq(omPositions.id, positionId), eq(omPositions.workspaceId, workspaceId)))
    .limit(1);

  if (!pos) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced position (id=${positionId}) does not exist in this workspace`,
    });
  }
}

/**
 * Validate that a referenced legal entity exists within the workspace.
 */
export async function validateLegalEntityRef(workspaceId: number, entityId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [entity] = await db
    .select({ id: omLegalEntities.id, status: omLegalEntities.status })
    .from(omLegalEntities)
    .where(and(eq(omLegalEntities.id, entityId), eq(omLegalEntities.workspaceId, workspaceId)))
    .limit(1);

  if (!entity) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced legal entity (id=${entityId}) does not exist in this workspace`,
    });
  }
  if (entity.status === "dissolved") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced legal entity (id=${entityId}) is dissolved`,
    });
  }
}

/**
 * Validate that a referenced cost center exists within the workspace.
 */
export async function validateCostCenterRef(workspaceId: number, costCenterId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  const [cc] = await db
    .select({ id: omCostCenters.id, status: omCostCenters.status })
    .from(omCostCenters)
    .where(and(eq(omCostCenters.id, costCenterId), eq(omCostCenters.workspaceId, workspaceId)))
    .limit(1);

  if (!cc) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced cost center (id=${costCenterId}) does not exist in this workspace`,
    });
  }
  if (cc.status === "closed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Referenced cost center (id=${costCenterId}) is closed`,
    });
  }
}

// ============================================================================
// Alignment Matrix Validators
// ============================================================================

export async function validateAlignmentMatrixVersionRef(workspaceId: number, matrixVersionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [ver] = await db.select({ id: omAlignmentMatrixVersions.id })
    .from(omAlignmentMatrixVersions)
    .where(and(eq(omAlignmentMatrixVersions.id, matrixVersionId), eq(omAlignmentMatrixVersions.workspaceId, workspaceId)))
    .limit(1);
  if (!ver) throw new TRPCError({ code: "BAD_REQUEST", message: `Alignment matrix version (id=${matrixVersionId}) not found` });
}

export async function validateAlignmentTypeRef(workspaceId: number, matrixVersionId: number, typeId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [t] = await db.select({ id: omAlignmentTypes.id })
    .from(omAlignmentTypes)
    .where(and(eq(omAlignmentTypes.id, typeId), eq(omAlignmentTypes.matrixVersionId, matrixVersionId), eq(omAlignmentTypes.workspaceId, workspaceId)))
    .limit(1);
  if (!t) throw new TRPCError({ code: "BAD_REQUEST", message: `Alignment type (id=${typeId}) not found in matrix version ${matrixVersionId}` });
}

export async function validateAlignmentAttributeRef(workspaceId: number, matrixVersionId: number, attributeId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [a] = await db.select({ id: omAlignmentAttributes.id })
    .from(omAlignmentAttributes)
    .where(and(eq(omAlignmentAttributes.id, attributeId), eq(omAlignmentAttributes.matrixVersionId, matrixVersionId), eq(omAlignmentAttributes.workspaceId, workspaceId)))
    .limit(1);
  if (!a) throw new TRPCError({ code: "BAD_REQUEST", message: `Alignment attribute (id=${attributeId}) not found in matrix version ${matrixVersionId}` });
}

export async function requireSingleActiveAlignmentMatrixVersion(workspaceId: number): Promise<{ id: number }> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [ver] = await db.select({ id: omAlignmentMatrixVersions.id })
    .from(omAlignmentMatrixVersions)
    .where(and(eq(omAlignmentMatrixVersions.workspaceId, workspaceId), eq(omAlignmentMatrixVersions.status, "active")))
    .limit(1);
  if (!ver) throw new TRPCError({ code: "BAD_REQUEST", message: "No active alignment matrix version exists for this workspace" });
  return ver;
}

export async function requireStructureVersionDraft(workspaceId: number, structureVersionId: number): Promise<{ id: number }> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [ver] = await db.select({ id: omStructureVersions.id, status: omStructureVersions.status })
    .from(omStructureVersions)
    .where(and(eq(omStructureVersions.id, structureVersionId), eq(omStructureVersions.workspaceId, workspaceId)))
    .limit(1);
  if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "Structure version not found" });
  if (ver.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Structure version is not in draft status" });
  return ver;
}

export async function requireSelectionValueAllowed(workspaceId: number, matrixVersionId: number, attributeId: number, selectedValueText: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const cells = await db.select({ valueText: omAlignmentCells.valueText })
    .from(omAlignmentCells)
    .where(and(eq(omAlignmentCells.matrixVersionId, matrixVersionId), eq(omAlignmentCells.attributeId, attributeId)));
  const allowed = cells.map(c => c.valueText);
  if (!allowed.includes(selectedValueText)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Value "${selectedValueText}" is not in the allowed set for this attribute` });
  }
}

export async function requireCompleteAlignmentMatrixVersion(workspaceId: number, matrixVersionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const types = await db.select({ id: omAlignmentTypes.id })
    .from(omAlignmentTypes)
    .where(and(eq(omAlignmentTypes.matrixVersionId, matrixVersionId), eq(omAlignmentTypes.isActive, true)));
  const attrs = await db.select({ id: omAlignmentAttributes.id })
    .from(omAlignmentAttributes)
    .where(and(eq(omAlignmentAttributes.matrixVersionId, matrixVersionId), eq(omAlignmentAttributes.isActive, true)));
  if (types.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Matrix version has no active types" });
  if (attrs.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Matrix version has no active attributes" });
  const cells = await db.select({ id: omAlignmentCells.id })
    .from(omAlignmentCells)
    .where(eq(omAlignmentCells.matrixVersionId, matrixVersionId));
  const expected = types.length * attrs.length;
  if (cells.length < expected) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Matrix is incomplete: ${cells.length}/${expected} cells filled` });
  }
}
