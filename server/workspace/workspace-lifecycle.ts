/**
 * Workspace Lifecycle — Canonical 9-status lifecycle enforcement
 *
 * Lifecycle statuses:
 *   draft → ready_for_review → under_review → approved → published → active
 *   under_review → rejected → archived
 *   active → archived → deleted
 *
 * WORKSPACE INVARIANTS:
 *   WS-04: Every workspace has a lifecycle status that gates execution
 *   WS-06: Non-executable workspaces reject write operations
 */

import type { WorkspaceStatus } from "../../drizzle/tables/users";
import type { WorkspaceContext } from "./workspace-contract";

// ============================================================================
// Allowed Transitions — the canonical lifecycle graph
// ============================================================================

export const LIFECYCLE_TRANSITIONS: Record<WorkspaceStatus, WorkspaceStatus[]> = {
  draft: ["ready_for_review", "deleted"],
  ready_for_review: ["under_review", "draft"],
  under_review: ["approved", "rejected"],
  approved: ["published", "archived"],
  published: ["active", "archived"],
  active: ["archived"],
  rejected: ["draft", "archived"],
  archived: ["deleted", "draft"],
  deleted: [],
};

// ============================================================================
// Status Classification Sets
// ============================================================================

/** Statuses that allow full read+write execution */
const FULLY_EXECUTABLE: ReadonlySet<WorkspaceStatus> = new Set([
  "active",
]);

/** Statuses that allow setup/draft modifications (not full execution) */
const SETUP_MUTABLE: ReadonlySet<WorkspaceStatus> = new Set([
  "draft",
  "ready_for_review",
  "rejected",
]);

/** Statuses that allow read-only access */
const READ_ONLY: ReadonlySet<WorkspaceStatus> = new Set([
  "under_review",
  "approved",
  "published",
  "archived",
]);

/** Statuses that block all access */
const NON_ACCESSIBLE: ReadonlySet<WorkspaceStatus> = new Set([
  "deleted",
]);

/** Actions permitted even on archived/non-executable workspaces */
export const ARCHIVED_ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  "workspace.unarchive",
  "workspace.get",
  "workspace.list",
  "workspace.export",
  "workspace.transition",
]);

// ============================================================================
// Status Check Helpers
// ============================================================================

/**
 * Check if a workspace status allows full execution (active only).
 */
export function isWorkspaceExecutable(status: WorkspaceStatus): boolean {
  return FULLY_EXECUTABLE.has(status);
}

/**
 * Check if a workspace is in a setup-mutable state (draft/ready_for_review/rejected).
 * These statuses allow modifications but not full operational execution.
 */
export function isWorkspaceSetupMutable(status: WorkspaceStatus): boolean {
  return SETUP_MUTABLE.has(status);
}

/**
 * Check if a workspace status allows read access.
 */
export function isWorkspaceReadable(status: WorkspaceStatus): boolean {
  return (
    FULLY_EXECUTABLE.has(status) ||
    SETUP_MUTABLE.has(status) ||
    READ_ONLY.has(status)
  );
}

/**
 * Check if a workspace is published (visible in WS Catalog).
 */
export function isWorkspacePublished(status: WorkspaceStatus): boolean {
  return status === "published" || status === "active";
}

/**
 * Check if a workspace is in a terminal/non-accessible state.
 */
export function isWorkspaceDeleted(status: WorkspaceStatus): boolean {
  return status === "deleted";
}

/**
 * Check if a transition from currentStatus to targetStatus is allowed.
 */
export function isTransitionAllowed(
  currentStatus: WorkspaceStatus,
  targetStatus: WorkspaceStatus
): boolean {
  const allowed = LIFECYCLE_TRANSITIONS[currentStatus];
  return allowed?.includes(targetStatus) ?? false;
}

/**
 * Get the list of statuses that can be transitioned to from the current status.
 */
export function getAllowedTransitions(currentStatus: WorkspaceStatus): WorkspaceStatus[] {
  return LIFECYCLE_TRANSITIONS[currentStatus] ?? [];
}

// ============================================================================
// Enforcement Helpers
// ============================================================================

/**
 * Require that a workspace is in an executable state.
 * Throws if the workspace is not active.
 */
export function requireExecutableWorkspace(
  ctx: WorkspaceContext,
  action?: string
): void {
  if (isWorkspaceExecutable(ctx.status)) return;

  // Check setup-mutable — allow draft operations
  if (isWorkspaceSetupMutable(ctx.status) && action?.startsWith("workspace.")) {
    return;
  }

  // Check archived escape hatch
  if (ctx.status === "archived" && action && ARCHIVED_ALLOWED_ACTIONS.has(action)) {
    return;
  }

  if (isWorkspaceDeleted(ctx.status)) {
    throw new Error(
      `Workspace ${ctx.workspaceId} is deleted and cannot be accessed`
    );
  }

  throw new Error(
    `Workspace ${ctx.workspaceId} is ${ctx.status} — mutating operations are blocked. ` +
    `Allowed actions on archived workspaces: ${[...ARCHIVED_ALLOWED_ACTIONS].join(", ")}`
  );
}

/**
 * Require that a workspace is at least readable.
 * Throws only for deleted workspaces.
 */
export function requireReadableWorkspace(ctx: WorkspaceContext): void {
  if (isWorkspaceReadable(ctx.status)) return;

  throw new Error(
    `Workspace ${ctx.workspaceId} is ${ctx.status} and cannot be accessed`
  );
}

/**
 * Check if a specific action is allowed given workspace status.
 */
export function isActionAllowed(
  status: WorkspaceStatus,
  action: string,
  isRead: boolean
): boolean {
  if (NON_ACCESSIBLE.has(status)) return false;
  if (isRead) return isWorkspaceReadable(status);
  if (FULLY_EXECUTABLE.has(status)) return true;
  if (SETUP_MUTABLE.has(status) && action.startsWith("workspace.")) return true;
  return ARCHIVED_ALLOWED_ACTIONS.has(action);
}

/**
 * Validate and execute a lifecycle transition.
 * Returns the new status if allowed, throws if not.
 */
export function validateTransition(
  currentStatus: WorkspaceStatus,
  targetStatus: WorkspaceStatus
): WorkspaceStatus {
  if (!isTransitionAllowed(currentStatus, targetStatus)) {
    throw new Error(
      `Lifecycle transition from '${currentStatus}' to '${targetStatus}' is not allowed. ` +
      `Valid transitions: ${getAllowedTransitions(currentStatus).join(", ") || "none"}`
    );
  }
  return targetStatus;
}
