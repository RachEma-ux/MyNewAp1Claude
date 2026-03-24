/**
 * Shared HR Role Definition Types, Enums, and Validators
 *
 * Used by both server and client for role-definition lifecycle,
 * visibility, change types, review outcomes, and DTO contracts.
 */

// ============================================================================
// Lifecycle Statuses
// ============================================================================

export const ROLE_DEF_VERSION_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "effective",
  "superseded",
  "retired",
] as const;

export type RoleDefVersionStatus = typeof ROLE_DEF_VERSION_STATUSES[number];

export const ROLE_DEF_ENTITY_STATUSES = ["active", "retired", "archived"] as const;
export type RoleDefEntityStatus = typeof ROLE_DEF_ENTITY_STATUSES[number];

// ============================================================================
// Visibility Classes
// ============================================================================

export const ROLE_DEF_VISIBILITY_CLASSES = [
  "public_internal",
  "team_visible",
  "manager_visible",
  "hr_restricted",
  "admin_restricted",
  "confidential_case",
] as const;

export type RoleDefVisibilityClass = typeof ROLE_DEF_VISIBILITY_CLASSES[number];

// ============================================================================
// Change Types
// ============================================================================

export const ROLE_DEF_CHANGE_TYPES = [
  "minor_wording",
  "material",
  "structural",
  "visibility_change",
  "retirement",
] as const;

export type RoleDefChangeType = typeof ROLE_DEF_CHANGE_TYPES[number];

// ============================================================================
// Review Outcomes
// ============================================================================

export const ROLE_DEF_REVIEW_OUTCOMES = [
  "approved",
  "changes_requested",
  "rejected",
] as const;

export type RoleDefReviewOutcome = typeof ROLE_DEF_REVIEW_OUTCOMES[number];

// ============================================================================
// Valid State Transitions
// ============================================================================

export const ROLE_DEF_VERSION_TRANSITIONS: Record<RoleDefVersionStatus, RoleDefVersionStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "changes_requested"],
  changes_requested: ["in_review"],
  approved: ["published"],
  published: ["effective", "superseded"],
  effective: ["superseded", "retired"],
  superseded: [], // terminal for this version
  retired: [], // terminal
};

/**
 * Check if a lifecycle transition is valid.
 */
export function isValidRoleDefTransition(
  from: RoleDefVersionStatus,
  to: RoleDefVersionStatus,
): boolean {
  return ROLE_DEF_VERSION_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// Persona Model for Visibility
// ============================================================================

export const ROLE_DEF_PERSONAS = [
  "employee",
  "manager",
  "hrbp",
  "admin",
  "governance_reviewer",
] as const;

export type RoleDefPersona = typeof ROLE_DEF_PERSONAS[number];

// ============================================================================
// Restricted Fields — fields that require masking for non-privileged personas
// ============================================================================

export const ROLE_DEF_RESTRICTED_FIELDS = [
  "compensationNotes",
  "successionNotes",
  "restructuringNotes",
  "sensitivityNotes",
  "complianceNotes",
  "sodConstraints",
] as const;

export const ROLE_DEF_MANAGER_VISIBLE_FIELDS = [
  "directReportsScope",
  "escalationTriggers",
  "boundariesOutOfScope",
] as const;

// ============================================================================
// DTO Shapes
// ============================================================================

export interface RoleDefListItem {
  id: number;
  roleCode: string;
  title: string;
  orgUnitId: number | null;
  jobFamilyId: number | null;
  jobLevelId: number | null;
  status: string;
  currentVersionId: number | null;
  currentVersionStatus: string | null;
  visibilityClass: string | null;
  effectiveFrom: string | null;
  updatedAt: string;
}

export interface RoleDefVersionSummary {
  id: number;
  versionNumber: number;
  status: string;
  changeType: string | null;
  changeReason: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
}

export interface RoleDefCompareResult {
  versionA: RoleDefVersionSummary;
  versionB: RoleDefVersionSummary;
  differences: Array<{
    field: string;
    valueA: unknown;
    valueB: unknown;
  }>;
}
