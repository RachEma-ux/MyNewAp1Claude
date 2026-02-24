/**
 * Workspace RBAC — Database query helpers
 *
 * Provides idempotent upsert and query functions for the capability-based
 * access control tables: capabilities, workspace_roles, workspace_role_capabilities,
 * workspace_principal_capabilities.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./connection";
import {
  capabilities,
  workspaceRoles,
  workspaceRoleCapabilities,
  workspacePrincipalCapabilities,
  workspaceMembers,
  type Capability,
  type WorkspaceRole,
} from "../../drizzle/schema";

// ============================================================================
// Capabilities
// ============================================================================

/**
 * Bulk insert capabilities. Skips existing keys (ON CONFLICT DO NOTHING).
 * Returns the number of rows inserted.
 */
export async function upsertCapabilities(
  caps: { key: string; description?: string }[]
): Promise<number> {
  const db = getDb();
  if (!db || caps.length === 0) return 0;

  const result = await db
    .insert(capabilities)
    .values(caps.map((c) => ({ key: c.key, description: c.description ?? null })))
    .onConflictDoNothing({ target: capabilities.key })
    .returning();

  return result.length;
}

/**
 * Get all capabilities from the catalog.
 */
export async function getAllCapabilities(): Promise<Capability[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(capabilities);
}

/**
 * Get a single capability by key.
 */
export async function getCapabilityByKey(key: string): Promise<Capability | undefined> {
  const db = getDb();
  if (!db) return undefined;
  const rows = await db.select().from(capabilities).where(eq(capabilities.key, key)).limit(1);
  return rows[0];
}

// ============================================================================
// Workspace Roles
// ============================================================================

/**
 * Upsert a workspace role. If a role with the same (workspaceId, name) exists,
 * returns the existing row. Otherwise inserts a new one.
 */
export async function upsertWorkspaceRole(
  workspaceId: number,
  name: string,
  description?: string,
  isSystem: boolean = false
): Promise<WorkspaceRole> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Check existing first
  const existing = await db
    .select()
    .from(workspaceRoles)
    .where(and(eq(workspaceRoles.workspaceId, workspaceId), eq(workspaceRoles.name, name)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(workspaceRoles)
    .values({ workspaceId, name, description, isSystem })
    .returning();

  return created;
}

/**
 * Get all roles for a workspace.
 */
export async function getWorkspaceRoles(workspaceId: number): Promise<WorkspaceRole[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(workspaceRoles).where(eq(workspaceRoles.workspaceId, workspaceId));
}

// ============================================================================
// Role → Capability Mappings
// ============================================================================

/**
 * Insert a role→capability mapping. Skips if already exists.
 */
export async function upsertRoleCapability(
  roleId: number,
  capabilityId: number,
  scope: string = "workspace",
  constraints?: Record<string, unknown> | null
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db
    .insert(workspaceRoleCapabilities)
    .values({ roleId, capabilityId, scope, constraints: constraints ?? null })
    .onConflictDoNothing();
}

// ============================================================================
// Workspace Members — roleId assignment
// ============================================================================

/**
 * Upsert a workspace member with a roleId. If the membership already exists
 * (same workspaceId + userId), updates the roleId. Otherwise creates a new entry.
 */
export async function upsertWorkspaceMember(
  workspaceId: number,
  userId: number,
  roleId: number,
  role: string = "viewer"
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(workspaceMembers)
      .set({ roleId, role })
      .where(eq(workspaceMembers.id, existing[0].id));
  } else {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId, roleId, role });
  }
}
