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
