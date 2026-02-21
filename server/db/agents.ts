import { eq, desc } from "drizzle-orm";
import { agents, InsertAgent, Agent } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createAgent(agent: InsertAgent): Promise<Agent> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(agents).values(agent).returning();
  return created;
}

export async function getWorkspaceAgents(workspaceId: number): Promise<Agent[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(agents).where(eq(agents.workspaceId, workspaceId)).orderBy(desc(agents.createdAt));
}

export async function getAgentById(agentId: number): Promise<Agent | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return result[0];
}

export async function updateAgent(agentId: number, updates: Partial<Agent>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(agents).set(updates).where(eq(agents.id, agentId));
}

export async function deleteAgent(agentId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(agents).where(eq(agents.id, agentId));
}
