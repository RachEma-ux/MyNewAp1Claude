import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { workflows } from "../../drizzle/schema";

export interface WorkflowPermissions {
  canEdit: number[];
  canPublish: number[];
  canExecute: number[];
}

/**
 * Get default permissions for a new workflow
 * Owner gets all permissions by default
 */
export function getDefaultPermissions(ownerId: number): WorkflowPermissions {
  return {
    canEdit: [ownerId],
    canPublish: [ownerId],
    canExecute: [ownerId],
  };
}

/**
 * Get workflow permissions
 */
export async function getWorkflowPermissions(
  workflowId: number,
  userId: number
): Promise<WorkflowPermissions | null> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) return null;

  // Only owner can view permissions
  if (workflow.userId !== userId) {
    throw new Error("Only the owner can view workflow permissions");
  }

  return (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(userId);
}

/**
 * Check if user can edit workflow
 */
export async function canEditWorkflow(
  workflowId: number,
  userId: number
): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) return false;

  // Owner can always edit
  if (workflow.userId === userId) return true;

  // Check permissions
  const perms = (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(workflow.userId);
  return perms.canEdit.includes(userId);
}

/**
 * Check if user can publish workflow
 */
export async function canPublishWorkflow(
  workflowId: number,
  userId: number
): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) return false;

  // Owner can always publish
  if (workflow.userId === userId) return true;

  // Check permissions
  const perms = (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(workflow.userId);
  return perms.canPublish.includes(userId);
}

/**
 * Check if user can execute workflow
 */
export async function canExecuteWorkflow(
  workflowId: number,
  userId: number
): Promise<boolean> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) return false;

  // Public workflows can be executed by anyone
  if (workflow.isPublic) return true;

  // Owner can always execute
  if (workflow.userId === userId) return true;

  // Check permissions
  const perms = (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(workflow.userId);
  return perms.canExecute.includes(userId);
}

/**
 * Add permission to workflow
 */
export async function addPermission(
  workflowId: number,
  ownerId: number,
  targetUserId: number,
  permission: "canEdit" | "canPublish" | "canExecute"
): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) throw new Error("Workflow not found");

  // Only owner can modify permissions
  if (workflow.userId !== ownerId) {
    throw new Error("Only the owner can modify workflow permissions");
  }

  const perms = (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(ownerId);

  // Add user to permission list if not already there
  if (!perms[permission].includes(targetUserId)) {
    perms[permission].push(targetUserId);
  }

  await database
    .update(workflows)
    .set({ permissions: perms as any })
    .where(eq(workflows.id, workflowId));
}

/**
 * Remove permission from workflow
 */
export async function removePermission(
  workflowId: number,
  ownerId: number,
  targetUserId: number,
  permission: "canEdit" | "canPublish" | "canExecute"
): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) throw new Error("Workflow not found");

  // Only owner can modify permissions
  if (workflow.userId !== ownerId) {
    throw new Error("Only the owner can modify workflow permissions");
  }

  const perms = (workflow.permissions as WorkflowPermissions) || getDefaultPermissions(ownerId);

  // Remove user from permission list
  perms[permission] = perms[permission].filter((id) => id !== targetUserId);

  await database
    .update(workflows)
    .set({ permissions: perms as any })
    .where(eq(workflows.id, workflowId));
}

/**
 * Set workflow public status
 */
export async function setWorkflowPublic(
  workflowId: number,
  ownerId: number,
  isPublic: boolean
): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [workflow] = await database
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) throw new Error("Workflow not found");

  // Only owner can change public status
  if (workflow.userId !== ownerId) {
    throw new Error("Only the owner can change workflow public status");
  }

  await database
    .update(workflows)
    .set({ isPublic })
    .where(eq(workflows.id, workflowId));
}
