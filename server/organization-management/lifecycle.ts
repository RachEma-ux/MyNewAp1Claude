/**
 * Organization Management — Lifecycle State Machines
 *
 * Defines valid state transitions for all OM entity types.
 * Every status change must pass through validateTransition().
 */

import { TRPCError } from "@trpc/server";

// ============================================================================
// Legal Entity Lifecycle
// ============================================================================

export type LegalEntityStatus = "active" | "inactive" | "dissolved";

export const LEGAL_ENTITY_TRANSITIONS: Record<LegalEntityStatus, readonly LegalEntityStatus[]> = {
  active: ["inactive", "dissolved"],
  inactive: ["active", "dissolved"],
  dissolved: [], // terminal
};

// ============================================================================
// Org Unit Lifecycle
// ============================================================================

export type OrgUnitStatus = "active" | "inactive" | "frozen" | "archived";

export const ORG_UNIT_TRANSITIONS: Record<OrgUnitStatus, readonly OrgUnitStatus[]> = {
  active: ["inactive", "frozen", "archived"],
  inactive: ["active", "archived"],
  frozen: ["active", "archived"],
  archived: [], // terminal
};

// ============================================================================
// Job Lifecycle
// ============================================================================

export type JobStatus = "active" | "deprecated" | "retired";

export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  active: ["deprecated", "retired"],
  deprecated: ["active", "retired"],
  retired: [], // terminal
};

// ============================================================================
// Position Lifecycle
// ============================================================================

export type PositionStatus = "vacant" | "filled" | "frozen" | "temporary" | "closed";

export const POSITION_TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  vacant: ["filled", "frozen", "temporary", "closed"],
  filled: ["vacant", "frozen", "closed"],
  frozen: ["vacant", "closed"],
  temporary: ["vacant", "filled", "closed"],
  closed: [], // terminal
};

// ============================================================================
// Reporting Relationship Lifecycle
// ============================================================================

export type ReportingStatus = "active" | "inactive" | "ended";

export const REPORTING_TRANSITIONS: Record<ReportingStatus, readonly ReportingStatus[]> = {
  active: ["inactive", "ended"],
  inactive: ["active", "ended"],
  ended: [], // terminal
};

// ============================================================================
// Cost Center Lifecycle
// ============================================================================

export type CostCenterStatus = "active" | "inactive" | "closed";

export const COST_CENTER_TRANSITIONS: Record<CostCenterStatus, readonly CostCenterStatus[]> = {
  active: ["inactive", "closed"],
  inactive: ["active", "closed"],
  closed: [], // terminal
};

// ============================================================================
// Structure Version Lifecycle
// ============================================================================

export type StructureVersionStatus = "draft" | "published" | "archived" | "superseded";

export const STRUCTURE_VERSION_TRANSITIONS: Record<StructureVersionStatus, readonly StructureVersionStatus[]> = {
  draft: ["published", "archived"],
  published: ["superseded", "archived"],
  superseded: [], // terminal
  archived: [], // terminal
};

// ============================================================================
// Generic transition validator
// ============================================================================

type TransitionMap = Record<string, readonly string[]>;

export function validateTransition(
  entityType: string,
  transitions: TransitionMap,
  from: string,
  to: string,
): void {
  if (from === to) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: status is already "${from}"`,
    });
  }

  const allowed = transitions[from];
  if (!allowed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: unknown status "${from}"`,
    });
  }

  if (!allowed.includes(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: transition "${from}" → "${to}" is not allowed. Valid transitions: ${allowed.join(", ") || "none (terminal state)"}`,
    });
  }
}

// Convenience wrappers per entity type
export const validateLegalEntityTransition = (from: string, to: string) =>
  validateTransition("LegalEntity", LEGAL_ENTITY_TRANSITIONS, from, to);

export const validateOrgUnitTransition = (from: string, to: string) =>
  validateTransition("OrgUnit", ORG_UNIT_TRANSITIONS, from, to);

export const validateJobTransition = (from: string, to: string) =>
  validateTransition("Job", JOB_TRANSITIONS, from, to);

export const validatePositionTransition = (from: string, to: string) =>
  validateTransition("Position", POSITION_TRANSITIONS, from, to);

export const validateReportingTransition = (from: string, to: string) =>
  validateTransition("ReportingRelationship", REPORTING_TRANSITIONS, from, to);

export const validateCostCenterTransition = (from: string, to: string) =>
  validateTransition("CostCenter", COST_CENTER_TRANSITIONS, from, to);

export const validateStructureVersionTransition = (from: string, to: string) =>
  validateTransition("StructureVersion", STRUCTURE_VERSION_TRANSITIONS, from, to);
