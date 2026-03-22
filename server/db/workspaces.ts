import { eq, and, desc } from "drizzle-orm";
import {
  workspaces,
  InsertWorkspace,
  Workspace,
  workspaceMembers,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { createAppBlockerError, wrapDbError } from "../_core/blockers";

export async function ensureDefaultWorkspace(): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    const rows = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    if (rows.length > 0) return;

    await db.insert(workspaces).values({
      name: "Default",
      description: "Auto-created default workspace",
      ownerId: 1,
      status: "active",
      purposeType: "other",
    });
    console.log("[Workspace] Created default workspace");
  } catch (error: any) {
    console.warn(`[Workspace] ensureDefaultWorkspace skipped — ${error.message}`);
  }
}

export async function createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
  const db = getDb();
  if (!db) {
    throw createAppBlockerError({
      code: "database_unavailable",
      category: "technical_error",
      title: "The service is not ready",
      summary: "The app could not reach its database, so this workspace could not be created.",
      recommendedActions: [
        "Confirm the database is running, then try again.",
      ],
      retryable: true,
      technicalDetails: "Database not available",
    }, "INTERNAL_SERVER_ERROR");
  }

  try {
    const [created] = await db.insert(workspaces).values(workspace).returning();

    await db.insert(workspaceMembers).values({
      workspaceId: created.id,
      userId: workspace.ownerId,
      role: "owner",
    });

    return created;
  } catch (error) {
    throw wrapDbError(error, {
      operation: "create",
      entity: "workspace",
      missingDependencyTitle: "Workspace setup is incomplete",
      missingDependencySummary: "The app could not create this workspace because a required setup record is missing.",
      missingDependencyActions: [
        "Make sure the owner account and required bootstrap records exist, then try again.",
        "If this environment was just initialized, run the missing seed or bootstrap step first.",
      ],
    });
  }
}

export async function getUserWorkspaces(userId: number): Promise<Workspace[]> {
  const db = getDb();
  if (!db) return [];

  const result = await db
    .select({
      workspace: workspaces,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.updatedAt));

  return result.map((r) => r.workspace);
}

export async function getWorkspaceById(workspaceId: number): Promise<Workspace | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return result[0];
}

export async function updateWorkspace(workspaceId: number, updates: Partial<Workspace>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(workspaces).set(updates).where(eq(workspaces.id, workspaceId));
}

export async function deleteWorkspace(workspaceId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function hasWorkspaceAccess(userId: number, workspaceId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);

  return result.length > 0;
}

export async function getPlatformAgentDefinitionsWorkspaceId(): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await ensureDefaultWorkspace();

  const rows = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (!rows[0]) {
    throw createAppBlockerError({
      code: "platform_workspace_missing",
      category: "dependency_block",
      title: "A required platform workspace is missing",
      summary: "The app is missing the workspace record it needs to store platform agent definitions.",
      recommendedActions: [
        "Create or restore the default platform workspace, then try again.",
      ],
      technicalDetails: "Platform workspace not available",
    }, "CONFLICT");
  }

  return rows[0].id;
}
