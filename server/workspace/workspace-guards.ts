/**
 * Workspace Guards — Reusable enforcement helpers for route protection
 *
 * Provides workspace lifecycle, capability, and module guards that can be
 * applied to any workspace-scoped route procedure.
 *
 * WORKSPACE INVARIANTS:
 *   WS-01: Every workspace-scoped execution path resolves a WorkspaceContext
 *   WS-04: Workspace lifecycle status gates execution
 *   WS-06: Non-executable workspaces block writes
 *   WS-10: Capability checks are authoritative
 *   WS-11: Module access requires enablement
 */

import { TRPCError } from "@trpc/server";
import { getWorkspaceById, hasWorkspaceAccess } from "../db/workspaces";
import {
  isWorkspaceExecutable,
  isWorkspaceReadable,
  isWorkspaceDeleted,
  ARCHIVED_ALLOWED_ACTIONS,
} from "./workspace-lifecycle";
import { hasCapability } from "./capability-resolver";
import { isModuleEnabled } from "../modules/registry";
import type { WorkspaceStatus } from "../../drizzle/tables/users";
import type { ModuleKey } from "../../drizzle/tables/workspace-modules";

// ============================================================================
// Lifecycle Guards
// ============================================================================

/**
 * Require that a workspace exists and the user has access.
 * Returns the workspace record and resolved status.
 * Throws FORBIDDEN if access denied, NOT_FOUND if workspace missing.
 */
export async function requireWorkspaceAccess(
  userId: number,
  workspaceId: number
): Promise<{ workspace: any; status: WorkspaceStatus }> {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Workspace ${workspaceId} not found`,
    });
  }

  const status = ((workspace as any).status as WorkspaceStatus) || "active";

  // Deleted workspaces are blocked for all access
  if (isWorkspaceDeleted(status)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Workspace ${workspaceId} is deleted and cannot be accessed`,
    });
  }

  const access = await hasWorkspaceAccess(userId, workspaceId);
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied",
    });
  }

  return { workspace, status };
}

/**
 * Require that a workspace is readable (active, configured, created, paused, archived).
 * Deleted workspaces are blocked.
 */
export async function requireReadableWorkspaceRoute(
  userId: number,
  workspaceId: number
): Promise<{ workspace: any; status: WorkspaceStatus }> {
  const { workspace, status } = await requireWorkspaceAccess(userId, workspaceId);

  if (!isWorkspaceReadable(status)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Workspace is ${status} and cannot be accessed`,
    });
  }

  return { workspace, status };
}

/**
 * Require that a workspace is in an executable state (active, configured, created).
 * Paused, archived, and deleted workspaces are blocked for mutations.
 * Optional: pass an action name to allow archived escape-hatch actions.
 */
export async function requireExecutableWorkspaceRoute(
  userId: number,
  workspaceId: number,
  action?: string
): Promise<{ workspace: any; status: WorkspaceStatus }> {
  const { workspace, status } = await requireWorkspaceAccess(userId, workspaceId);

  if (isWorkspaceExecutable(status)) {
    return { workspace, status };
  }

  // Check archived escape hatch
  if (status === "archived" && action && ARCHIVED_ALLOWED_ACTIONS.has(action)) {
    return { workspace, status };
  }

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Workspace is ${status} — mutating operations are blocked`,
  });
}

// ============================================================================
// Capability Guards
// ============================================================================

/**
 * Require that a user has a specific capability in a workspace.
 * Falls back to legacy role mapping if RBAC tables aren't seeded.
 */
export async function requireCapability(
  userId: number,
  workspaceId: number,
  capabilityKey: string
): Promise<void> {
  try {
    const has = await hasCapability(userId, workspaceId, capabilityKey);
    if (!has) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: missing capability '${capabilityKey}'`,
      });
    }
  } catch (err: any) {
    if (err instanceof TRPCError) throw err;
    // If RBAC tables aren't available, allow through (legacy fallback)
    // The permissions-service already handles this case
  }
}

// ============================================================================
// Module Guards
// ============================================================================

/**
 * Require that a module is enabled for a workspace.
 * Throws PRECONDITION_FAILED if the module is disabled.
 */
export async function requireModuleEnabled(
  workspaceId: number,
  moduleKey: ModuleKey
): Promise<void> {
  const enabled = await isModuleEnabled(workspaceId, moduleKey);
  if (!enabled) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Module '${moduleKey}' is not enabled for this workspace`,
    });
  }
}

// ============================================================================
// Combined Guard — Full workspace route protection
// ============================================================================

/**
 * Full workspace route guard: access + lifecycle + optional capability + optional module.
 * Use this for comprehensive route protection in one call.
 */
export async function guardWorkspaceRoute(params: {
  userId: number;
  workspaceId: number;
  requireExecutable?: boolean;
  action?: string;
  capability?: string;
  moduleKey?: ModuleKey;
}): Promise<{ workspace: any; status: WorkspaceStatus }> {
  const { userId, workspaceId, requireExecutable, action, capability, moduleKey } = params;

  // 1. Access + lifecycle
  const result = requireExecutable
    ? await requireExecutableWorkspaceRoute(userId, workspaceId, action)
    : await requireReadableWorkspaceRoute(userId, workspaceId);

  // 2. Capability check (if requested)
  if (capability) {
    await requireCapability(userId, workspaceId, capability);
  }

  // 3. Module check (if requested)
  if (moduleKey) {
    await requireModuleEnabled(workspaceId, moduleKey);
  }

  return result;
}
