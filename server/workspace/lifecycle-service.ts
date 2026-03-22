/**
 * Workspace Lifecycle Service — Domain service for workspace lifecycle management
 *
 * Handles:
 *   - Lifecycle transitions with validation
 *   - Publication exposure logic
 *   - Workspace creation (draft)
 *   - Activity emission on transitions
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { workspaces, type WorkspaceStatus } from "../../drizzle/schema";
import {
  validateTransition,
  getAllowedTransitions,
  isWorkspacePublished,
  isWorkspaceExecutable,
} from "./workspace-lifecycle";
import { logActivity } from "../modules/registry";

// ============================================================================
// Lifecycle Transition Service
// ============================================================================

export interface TransitionResult {
  workspaceId: number;
  previousStatus: WorkspaceStatus;
  newStatus: WorkspaceStatus;
  transitionedAt: Date;
}

/**
 * Transition a workspace to a new lifecycle status.
 * Validates the transition, updates the database, and emits activity.
 */
export async function transitionWorkspace(
  workspaceId: number,
  targetStatus: WorkspaceStatus,
  actorId: number,
  metadata?: Record<string, unknown>
): Promise<TransitionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // 1. Load current workspace
  const [ws] = await db
    .select({ status: workspaces.status })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!ws) throw new Error(`Workspace ${workspaceId} not found`);

  const currentStatus = ws.status as WorkspaceStatus;

  // 2. Validate transition
  validateTransition(currentStatus, targetStatus);

  // 3. Update status
  const now = new Date();
  await db
    .update(workspaces)
    .set({ status: targetStatus, updatedAt: now })
    .where(eq(workspaces.id, workspaceId));

  // 4. Emit activity
  await logActivity({
    workspaceId,
    actorId,
    action: `workspace.transition.${targetStatus}`,
    metadata: {
      ...metadata,
      previousStatus: currentStatus,
      newStatus: targetStatus,
    },
  }).catch(() => {});

  return {
    workspaceId,
    previousStatus: currentStatus,
    newStatus: targetStatus,
    transitionedAt: now,
  };
}

/**
 * Submit workspace for review (draft → ready_for_review).
 * Manager action after completing workspace definition.
 */
export async function submitForReview(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "ready_for_review", actorId);
}

/**
 * Begin review (ready_for_review → under_review).
 * Admin/governance action to start validation.
 */
export async function beginReview(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "under_review", actorId);
}

/**
 * Approve workspace (under_review → approved).
 */
export async function approveWorkspace(
  workspaceId: number,
  actorId: number,
  notes?: string
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "approved", actorId, { notes });
}

/**
 * Publish workspace (approved → published).
 * Makes workspace visible in WS Catalog.
 */
export async function publishWorkspace(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "published", actorId);
}

/**
 * Activate workspace (published → active).
 * Makes workspace fully executable.
 */
export async function activateWorkspace(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "active", actorId);
}

/**
 * Reject workspace (under_review → rejected).
 */
export async function rejectWorkspace(
  workspaceId: number,
  actorId: number,
  reason: string
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "rejected", actorId, { reason });
}

/**
 * Archive workspace (active/approved/published → archived).
 */
export async function archiveWorkspace(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "archived", actorId);
}

/**
 * Delete workspace (archived → deleted).
 */
export async function softDeleteWorkspace(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "deleted", actorId);
}

/**
 * Return workspace to draft (rejected/archived → draft).
 */
export async function returnToDraft(
  workspaceId: number,
  actorId: number
): Promise<TransitionResult> {
  return transitionWorkspace(workspaceId, "draft", actorId);
}

// ============================================================================
// Publication Exposure Service
// ============================================================================

/**
 * List all workspaces visible in WS Catalog (published + active).
 * This is what participants see — not management inventory.
 */
export async function listPublishedWorkspaces(): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  return db
    .select()
    .from(workspaces)
    .where(
      // Published or active workspaces
      eq(workspaces.status, "published")
    )
    .then(async (published) => {
      const active = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.status, "active"));
      return [...published, ...active];
    });
}

/**
 * List all workspaces across all lifecycle statuses (management inventory).
 * This is the WS List — for managers and admins.
 */
export async function listAllWorkspaces(filters?: {
  status?: WorkspaceStatus;
  ownerId?: number;
}): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(workspaces);

  if (filters?.status) {
    query = query.where(eq(workspaces.status, filters.status)) as any;
  }
  if (filters?.ownerId) {
    query = query.where(eq(workspaces.ownerId, filters.ownerId)) as any;
  }

  return query;
}

/**
 * Get the lifecycle info for a workspace including allowed transitions.
 */
export async function getWorkspaceLifecycleInfo(workspaceId: number): Promise<{
  currentStatus: WorkspaceStatus;
  allowedTransitions: WorkspaceStatus[];
  isPublished: boolean;
  isExecutable: boolean;
} | null> {
  const db = getDb();
  if (!db) return null;

  const [ws] = await db
    .select({ status: workspaces.status })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!ws) return null;

  const status = ws.status as WorkspaceStatus;
  return {
    currentStatus: status,
    allowedTransitions: getAllowedTransitions(status),
    isPublished: isWorkspacePublished(status),
    isExecutable: isWorkspaceExecutable(status),
  };
}
