import { eq, and, desc } from "drizzle-orm";
import {
  workspaces,
  InsertWorkspace,
  Workspace,
  workspaceMembers,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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
    });
    console.log("[Workspace] Created default workspace");
  } catch (error: any) {
    console.warn(`[Workspace] ensureDefaultWorkspace skipped — ${error.message}`);
  }
}

export async function createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(workspaces).values(workspace).returning();

  await db.insert(workspaceMembers).values({
    workspaceId: created.id,
    userId: workspace.ownerId,
    role: "owner",
  });

  return created;
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
