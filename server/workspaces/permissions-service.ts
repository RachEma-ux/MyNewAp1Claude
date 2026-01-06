/**
 * Workspace Permissions Service
 * Handles workspace access control and permissions
 */

import { getDb } from "../db";
import { workspaces, workspaceMembers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspacePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
}

/**
 * Get user's role in a workspace
 */
export async function getUserWorkspaceRole(
  workspaceId: number,
  userId: number
): Promise<WorkspaceRole | null> {
  const db = getDb();
  if (!db) return null;
  
  // Check if user is owner
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  
  if (workspace?.ownerId === userId) {
    return "owner";
  }
  
  // Check workspace members
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (!member) return null;
  
  // Map database role to WorkspaceRole
  if (member.role === "owner") return "owner";
  if (member.role === "editor") return "member";
  if (member.role === "viewer") return "viewer";
  
  return null;
}

/**
 * Get permissions for a user in a workspace
 */
export async function getWorkspacePermissions(
  workspaceId: number,
  userId: number
): Promise<WorkspacePermissions> {
  const role = await getUserWorkspaceRole(workspaceId, userId);
  
  if (!role) {
    return {
      canRead: false,
      canWrite: false,
      canDelete: false,
      canManageMembers: false,
      canManageSettings: false,
    };
  }
  
  // Define permissions by role
  switch (role) {
    case "owner":
      return {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canManageMembers: true,
        canManageSettings: true,
      };
    
    case "admin":
      return {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canManageMembers: true,
        canManageSettings: false, // Only owner can change settings
      };
    
    case "member":
      return {
        canRead: true,
        canWrite: true,
        canDelete: false,
        canManageMembers: false,
        canManageSettings: false,
      };
    
    case "viewer":
      return {
        canRead: true,
        canWrite: false,
        canDelete: false,
        canManageMembers: false,
        canManageSettings: false,
      };
    
    default:
      return {
        canRead: false,
        canWrite: false,
        canDelete: false,
        canManageMembers: false,
        canManageSettings: false,
      };
  }
}

/**
 * Check if user has permission
 */
export async function hasPermission(
  workspaceId: number,
  userId: number,
  permission: keyof WorkspacePermissions
): Promise<boolean> {
  const permissions = await getWorkspacePermissions(workspaceId, userId);
  return permissions[permission];
}

/**
 * Add member to workspace
 */
export async function addWorkspaceMember(
  workspaceId: number,
  userId: number,
  role: "editor" | "viewer",
  addedBy: number
): Promise<void> {
  // Check if addedBy has permission to manage members
  const canManage = await hasPermission(workspaceId, addedBy, "canManageMembers");
  if (!canManage) {
    throw new Error("Permission denied: cannot manage workspace members");
  }
  
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if user is already a member
  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  
  if (existing) {
    throw new Error("User is already a member of this workspace");
  }
  
  // Add member
  await db.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role,
  });
  
  console.log(`[Permissions] Added user ${userId} to workspace ${workspaceId} as ${role}`);
}

/**
 * Remove member from workspace
 */
export async function removeWorkspaceMember(
  workspaceId: number,
  userId: number,
  removedBy: number
): Promise<void> {
  // Check if removedBy has permission to manage members
  const canManage = await hasPermission(workspaceId, removedBy, "canManageMembers");
  if (!canManage) {
    throw new Error("Permission denied: cannot manage workspace members");
  }
  
  // Cannot remove owner
  const role = await getUserWorkspaceRole(workspaceId, userId);
  if (role === "owner") {
    throw new Error("Cannot remove workspace owner");
  }
  
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    );
  
  console.log(`[Permissions] Removed user ${userId} from workspace ${workspaceId}`);
}

/**
 * Update member role
 */
export async function updateMemberRole(
  workspaceId: number,
  userId: number,
  newRole: "editor" | "viewer",
  updatedBy: number
): Promise<void> {
  // Check if updatedBy has permission to manage members
  const canManage = await hasPermission(workspaceId, updatedBy, "canManageMembers");
  if (!canManage) {
    throw new Error("Permission denied: cannot manage workspace members");
  }
  
  // Cannot change owner role
  const role = await getUserWorkspaceRole(workspaceId, userId);
  if (role === "owner") {
    throw new Error("Cannot change workspace owner role");
  }
  
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(workspaceMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    );
  
  console.log(`[Permissions] Updated user ${userId} role to ${newRole} in workspace ${workspaceId}`);
}

/**
 * Get all workspace members with their roles
 */
export async function getWorkspaceMembers(workspaceId: number): Promise<Array<{
  userId: number;
  role: WorkspaceRole;
  joinedAt: Date;
}>> {
  const db = getDb();
  if (!db) return [];
  
  // Get owner
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  
  const members: Array<{ userId: number; role: WorkspaceRole; joinedAt: Date }> = [];
  
  if (workspace) {
    members.push({
      userId: workspace.ownerId,
      role: "owner",
      joinedAt: workspace.createdAt,
    });
  }
  
  // Get other members
  const dbMembers = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  
  for (const member of dbMembers) {
    const role: WorkspaceRole = 
      member.role === "owner" ? "owner" :
      member.role === "editor" ? "member" :
      "viewer";
    
    members.push({
      userId: member.userId,
      role,
      joinedAt: member.createdAt,
    });
  }
  
  return members;
}

/**
 * Get all workspaces user has access to
 */
export async function getUserWorkspaces(userId: number): Promise<Array<{
  workspaceId: number;
  name: string;
  role: WorkspaceRole;
}>> {
  const db = getDb();
  if (!db) return [];
  
  const result: Array<{ workspaceId: number; name: string; role: WorkspaceRole }> = [];
  
  // Get owned workspaces
  const ownedWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId));
  
  for (const ws of ownedWorkspaces) {
    result.push({
      workspaceId: ws.id,
      name: ws.name,
      role: "owner",
    });
  }
  
  // Get member workspaces
  const memberWorkspaces = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      name: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
  
  for (const ws of memberWorkspaces) {
    const role: WorkspaceRole = 
      ws.role === "owner" ? "owner" :
      ws.role === "editor" ? "member" :
      "viewer";
    
    result.push({
      workspaceId: ws.workspaceId,
      name: ws.name,
      role,
    });
  }
  
  return result;
}
