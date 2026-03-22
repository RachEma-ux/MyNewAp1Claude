/**
 * Workspace Lifecycle — Status enforcement helpers
 *
 * WORKSPACE INVARIANT WS-04:
 *   Every workspace has a lifecycle status that gates execution.
 *   Archived/deleted workspaces must block mutating operations.
 *
 * WORKSPACE INVARIANT WS-06:
 *   Non-executable workspaces must reject write operations
 *   but may allow read-only access.
 *
 * Status progression:
 *   created → configured → active → paused → archived → deleted
 *
 * Execution rules:
 *   - "active" and "configured" allow all operations
 *   - "created" allows all operations (initial setup phase)
 *   - "paused" allows reads but blocks mutations
 *   - "archived" allows reads but blocks all mutations except unarchive
 *   - "deleted" blocks everything
 */

import type { WorkspaceStatus } from "../../drizzle/tables/users";
import type { WorkspaceContext } from "./workspace-contract";

// ============================================================================
// Executable Status Sets
// ============================================================================

/** Statuses that allow full read+write execution */
const FULLY_EXECUTABLE: ReadonlySet<WorkspaceStatus> = new Set([
  "created",
  "configured",
  "active",
]);

/** Statuses that allow read-only access */
const READ_ONLY_EXECUTABLE: ReadonlySet<WorkspaceStatus> = new Set([
  "paused",
  "archived",
]);

/** Statuses that block all access */
const NON_EXECUTABLE: ReadonlySet<WorkspaceStatus> = new Set([
  "deleted",
]);

/** Actions permitted even on archived workspaces (escape hatch) */
export const ARCHIVED_ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  "workspace.unarchive",
  "workspace.get",
  "workspace.list",
  "workspace.export",
]);

// ============================================================================
// Status Check Helpers
// ============================================================================

/**
 * Check if a workspace status allows full execution (read + write).
 */
export function isWorkspaceExecutable(status: WorkspaceStatus): boolean {
  return FULLY_EXECUTABLE.has(status);
}

/**
 * Check if a workspace status allows read-only access.
 */
export function isWorkspaceReadable(status: WorkspaceStatus): boolean {
  return FULLY_EXECUTABLE.has(status) || READ_ONLY_EXECUTABLE.has(status);
}

/**
 * Check if a workspace is in a terminal/non-accessible state.
 */
export function isWorkspaceDeleted(status: WorkspaceStatus): boolean {
  return status === "deleted";
}

/**
 * Require that a workspace is in an executable state.
 * Throws if the workspace is paused, archived, or deleted.
 *
 * Use this guard before any mutating operation in workspace-scoped routes.
 */
export function requireExecutableWorkspace(
  ctx: WorkspaceContext,
  action?: string
): void {
  if (isWorkspaceExecutable(ctx.status)) return;

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
 * Returns true/false without throwing.
 */
export function isActionAllowed(
  status: WorkspaceStatus,
  action: string,
  isRead: boolean
): boolean {
  if (NON_EXECUTABLE.has(status)) return false;
  if (isRead) return isWorkspaceReadable(status);
  if (FULLY_EXECUTABLE.has(status)) return true;
  // Paused/archived — only allow escape-hatch actions
  return ARCHIVED_ALLOWED_ACTIONS.has(action);
}
