/**
 * Workspace Capability Resolver — Phase 2
 *
 * WORKSPACE INVARIANT WS-02:
 *   All workspace access decisions must resolve through the workspace capability model.
 *
 * This module bridges the rich RBAC schema (capabilities, workspace_roles,
 * workspace_role_capabilities, workspace_principal_capabilities) with the
 * runtime permission system.
 *
 * It reads from:
 *   - workspace_members (to find the user's roleId)
 *   - workspace_roles (to find the role definition)
 *   - workspace_role_capabilities (to find role→capability mappings)
 *   - workspace_principal_capabilities (per-user overrides: grant/deny)
 *   - workspaces.ownerId (owner always gets full capabilities)
 *
 * It provides:
 *   - resolveWorkspaceCapabilities(userId, workspaceId) → Set<string>
 *   - hasCapability(userId, workspaceId, capabilityKey) → boolean
 *   - capabilitiesToPermissions(capabilities) → WorkspacePermissions (compatibility adapter)
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  workspaces,
  workspaceMembers,
  capabilities,
  workspaceRoles,
  workspaceRoleCapabilities,
  workspacePrincipalCapabilities,
} from "../../drizzle/schema";
import type { WorkspacePermissions } from "../workspaces/permissions-service";

// ============================================================================
// Core Capability Resolver
// ============================================================================

/**
 * Resolve the effective set of capability keys for a user in a workspace.
 *
 * Resolution order:
 *   1. If user is workspace owner → all capabilities from WorkspaceOwner role
 *   2. Find user's roleId from workspace_members
 *   3. Load role→capability mappings from workspace_role_capabilities
 *   4. Apply per-user overrides from workspace_principal_capabilities
 *      - effect='grant' adds capability
 *      - effect='deny' removes capability
 *   5. Return final effective capability set
 *
 * Falls back to legacy role-based mapping if no RBAC data is seeded.
 */
export async function resolveWorkspaceCapabilities(
  userId: number,
  workspaceId: number
): Promise<Set<string>> {
  const db = getDb();
  if (!db) return new Set();

  // 1. Check if user is workspace owner
  const [workspace] = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return new Set();

  const isOwner = workspace.ownerId === userId;

  // 2. Find membership record
  const [membership] = await db
    .select({
      role: workspaceMembers.role,
      roleId: workspaceMembers.roleId,
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  // No membership and not owner = no access
  if (!membership && !isOwner) return new Set();

  // 3. Try to resolve via RBAC tables (roleId → role_capabilities)
  const effectiveRoleId = membership?.roleId ?? null;
  let roleCapKeys = new Set<string>();

  if (effectiveRoleId) {
    // Load capabilities from the role→capability mapping
    const roleCaps = await db
      .select({ key: capabilities.key })
      .from(workspaceRoleCapabilities)
      .innerJoin(
        capabilities,
        eq(capabilities.id, workspaceRoleCapabilities.capabilityId)
      )
      .where(eq(workspaceRoleCapabilities.roleId, effectiveRoleId));

    roleCapKeys = new Set(roleCaps.map((rc) => rc.key));
  }

  // If no RBAC data found, fall back to legacy role→capability mapping
  if (roleCapKeys.size === 0) {
    const legacyRole = isOwner ? "owner" : (membership?.role ?? null);
    roleCapKeys = legacyRoleToCapabilities(legacyRole);
  }

  // 4. Apply per-user overrides (grant/deny)
  const overrides = await db
    .select({
      key: capabilities.key,
      effect: workspacePrincipalCapabilities.effect,
    })
    .from(workspacePrincipalCapabilities)
    .innerJoin(
      capabilities,
      eq(capabilities.id, workspacePrincipalCapabilities.capabilityId)
    )
    .where(
      and(
        eq(workspacePrincipalCapabilities.workspaceId, workspaceId),
        eq(workspacePrincipalCapabilities.userId, userId)
      )
    );

  for (const override of overrides) {
    if (override.effect === "grant") {
      roleCapKeys.add(override.key);
    } else if (override.effect === "deny") {
      roleCapKeys.delete(override.key);
    }
  }

  return roleCapKeys;
}

/**
 * Check if a user has a specific capability in a workspace.
 */
export async function hasCapability(
  userId: number,
  workspaceId: number,
  capabilityKey: string
): Promise<boolean> {
  const caps = await resolveWorkspaceCapabilities(userId, workspaceId);
  return caps.has(capabilityKey);
}

// ============================================================================
// Compatibility Adapter — capabilities → WorkspacePermissions
// ============================================================================

/**
 * WORKSPACE INVARIANT WS-02 compatibility adapter:
 *
 * Maps resolved capabilities to the existing WorkspacePermissions interface
 * so that current consumers (routes, services) continue to work without change.
 *
 * This is the bridge between the new capability model and the old boolean permissions.
 */
export function capabilitiesToPermissions(caps: Set<string>): WorkspacePermissions {
  return {
    canRead: caps.has("models.view") || caps.has("documents.view") || caps.has("agents.view") || caps.size > 0,
    canWrite: caps.has("documents.upload") || caps.has("agents.create") || caps.has("models.manage") || caps.has("chat.send"),
    canDelete: caps.has("workspace.manage") || caps.has("documents.delete") || caps.has("agents.delete"),
    canManageMembers: caps.has("workspace.members.invite") || caps.has("workspace.members.remove"),
    canManageSettings: caps.has("workspace.settings") || caps.has("workspace.manage"),
  };
}

/**
 * Resolve capabilities and convert to WorkspacePermissions in one call.
 * This is the primary entry point for the compatibility adapter.
 */
export async function resolveWorkspacePermissions(
  userId: number,
  workspaceId: number
): Promise<WorkspacePermissions> {
  const caps = await resolveWorkspaceCapabilities(userId, workspaceId);
  return capabilitiesToPermissions(caps);
}

// ============================================================================
// Legacy Fallback — maps old role strings to capability sets
// ============================================================================

/**
 * Maps legacy role strings (owner/admin/editor/viewer) to a set of capabilities
 * that reproduces the current effective behavior.
 *
 * This ensures that workspaces without seeded RBAC data continue to work
 * with the same permission semantics.
 */
function legacyRoleToCapabilities(role: string | null): Set<string> {
  switch (role) {
    case "owner":
      return new Set([
        "workspace.manage",
        "workspace.settings",
        "workspace.members.invite",
        "workspace.members.remove",
        "workspace.members.editRole",
        "workspace.billing",
        "models.view",
        "models.manage",
        "models.benchmark",
        "providers.view",
        "providers.manage",
        "providers.secrets",
        "chat.send",
        "chat.history",
        "inference.route",
        "inference.batch",
        "documents.upload",
        "documents.view",
        "documents.delete",
        "documents.reindex",
        "agents.view",
        "agents.create",
        "agents.edit",
        "agents.delete",
        "agents.promote",
        "workflows.view",
        "workflows.manage",
        "workflows.execute",
        "governance.view",
        "governance.manage",
        "reporting.view",
        "reporting.manage",
      ]);

    case "admin":
      return new Set([
        "workspace.settings",
        "workspace.members.invite",
        "workspace.members.remove",
        "workspace.members.editRole",
        "models.view",
        "models.manage",
        "models.benchmark",
        "providers.view",
        "providers.manage",
        "providers.secrets",
        "chat.send",
        "chat.history",
        "inference.route",
        "inference.batch",
        "documents.upload",
        "documents.view",
        "documents.delete",
        "documents.reindex",
        "agents.view",
        "agents.create",
        "agents.edit",
        "agents.delete",
        "agents.promote",
        "workflows.view",
        "workflows.manage",
        "workflows.execute",
        "governance.view",
        "governance.manage",
        "reporting.view",
        "reporting.manage",
      ]);

    case "editor":
    case "member":
      return new Set([
        "models.view",
        "providers.view",
        "chat.send",
        "chat.history",
        "inference.route",
        "documents.upload",
        "documents.view",
        "agents.view",
        "agents.create",
        "agents.edit",
        "workflows.view",
        "workflows.execute",
        "governance.view",
        "reporting.view",
      ]);

    case "viewer":
      return new Set([
        "models.view",
        "providers.view",
        "chat.history",
        "documents.view",
        "agents.view",
        "workflows.view",
        "governance.view",
      ]);

    default:
      return new Set();
  }
}
