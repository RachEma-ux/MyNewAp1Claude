/**
 * Workspace Execution Contract — Phase 1
 *
 * WORKSPACE INVARIANT WS-01:
 *   Every workspace-scoped execution path must be able to resolve a WorkspaceContext.
 *
 * This module defines the canonical workspace runtime contract and provides
 * safe resolver helpers that validate access, load workspace data, resolve
 * enabled modules, and return a consistent context object.
 *
 * Usage:
 *   const ctx = await resolveWorkspaceContext(userId, workspaceId);
 *   // ctx is null if access denied or workspace not found
 *
 *   const ctx = await requireWorkspaceContext(userId, workspaceId);
 *   // throws if access denied or workspace not found
 */

import { getWorkspaceById, hasWorkspaceAccess } from "../db/workspaces";
import { getUserWorkspaceRole, getWorkspacePermissions, type WorkspacePermissions } from "../workspaces/permissions-service";
import { resolveWorkspaceCapabilities } from "./capability-resolver";
import { getWorkspaceModules } from "../modules/registry";
import type { Workspace, WorkspaceStatus, WorkspacePurposeType } from "../../drizzle/tables/users";

// ============================================================================
// Canonical WorkspaceContext — the execution contract shape
// ============================================================================

export interface WorkspaceContext {
  /** Workspace primary key */
  workspaceId: number;
  /** Workspace display name (convenience — avoids workspace.name lookups) */
  workspaceName: string;
  /** Authenticated user ID */
  userId: number;
  /** User's resolved role in this workspace (null = no access) */
  role: string | null;
  /** Effective role label (UX-facing) */
  effectiveRole: string | null;
  /** Effective permissions for this user in this workspace */
  permissions: WorkspacePermissions;
  /** Effective capabilities resolved from RBAC (WS-02) */
  effectiveCapabilities: Set<string>;
  /** List of enabled module keys for this workspace */
  enabledModules: string[];
  /** Workspace routing profile (provider routing config) */
  routingProfile: unknown;
  /** Resource profile (optional accountable allocation) */
  resourceProfile: unknown;
  /** Workspace type (personal, team, enterprise, sandbox, etc.) */
  workspaceType: string | null;
  /** Workspace lifecycle status — canonical 9-status model (WS-04) */
  status: WorkspaceStatus;
  /** Workspace purpose type (WS-05) */
  purposeType: WorkspacePurposeType | null;
  /** The full workspace record for convenience */
  workspace: Workspace;
}

// ============================================================================
// Resolver Helpers
// ============================================================================

/**
 * Resolve a WorkspaceContext for the given user and workspace.
 * Returns null if:
 *   - workspace does not exist
 *   - user does not have access to the workspace
 *   - database is unavailable
 *
 * This is the safe variant — callers should check for null.
 */
export async function resolveWorkspaceContext(
  userId: number,
  workspaceId: number
): Promise<WorkspaceContext | null> {
  // 1. Validate workspace exists
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) return null;

  // 2. Validate user has access
  const hasAccess = await hasWorkspaceAccess(userId, workspaceId);
  if (!hasAccess) return null;

  // 3. Resolve role
  const role = await getUserWorkspaceRole(workspaceId, userId);

  // 4. Resolve capabilities (WS-02)
  let effectiveCapabilities = new Set<string>();
  try {
    effectiveCapabilities = await resolveWorkspaceCapabilities(userId, workspaceId);
  } catch {
    // If RBAC tables aren't available, capabilities will be empty — permissions
    // still resolve via legacy fallback in getWorkspacePermissions.
  }

  // 5. Resolve permissions
  const permissions = await getWorkspacePermissions(workspaceId, userId);

  // 6. Load enabled modules
  let enabledModules: string[] = [];
  try {
    const modules = await getWorkspaceModules(workspaceId);
    enabledModules = modules
      .filter((m: any) => m.enabled)
      .map((m: any) => m.moduleKey);
  } catch {
    // If modules can't be loaded, default to empty — don't block context resolution
    enabledModules = [];
  }

  // 7. Extract routing profile
  const routingProfile = (workspace as Record<string, unknown>)?.routingProfile ?? null;

  // 8. Extract lifecycle fields (WS-04, WS-05)
  const status = ((workspace as any).status as WorkspaceStatus) ?? "active";
  const purposeType = ((workspace as any).purposeType as WorkspacePurposeType) ?? null;

  // 9. Extract resource profile
  const resourceProfile = (workspace as Record<string, unknown>)?.resourceProfile ?? null;

  return {
    workspaceId,
    workspaceName: workspace.name,
    userId,
    role,
    effectiveRole: role,
    permissions,
    effectiveCapabilities,
    enabledModules,
    routingProfile,
    resourceProfile,
    workspaceType: workspace.type ?? null,
    status,
    purposeType,
    workspace,
  };
}

/**
 * Require a WorkspaceContext — throws if the user cannot access the workspace.
 *
 * Use this in router procedures where access denial should be a hard error.
 */
export async function requireWorkspaceContext(
  userId: number,
  workspaceId: number
): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) {
    throw new Error(
      `Workspace access denied: user ${userId} cannot access workspace ${workspaceId}`
    );
  }
  return ctx;
}

/**
 * Check if a specific permission is granted in a resolved WorkspaceContext.
 * Convenience helper to avoid direct property access.
 */
export function hasContextPermission(
  ctx: WorkspaceContext,
  permission: keyof WorkspacePermissions
): boolean {
  return ctx.permissions[permission] === true;
}

/**
 * Check if a module is enabled in a resolved WorkspaceContext.
 */
export function isModuleEnabled(
  ctx: WorkspaceContext,
  moduleKey: string
): boolean {
  return ctx.enabledModules.includes(moduleKey);
}
