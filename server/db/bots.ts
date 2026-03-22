import { eq, desc } from "drizzle-orm";
import { bots, InsertBot, Bot } from "../../drizzle/tables/bots";
import { getDb } from "./connection";

export async function createBot(bot: InsertBot): Promise<Bot> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(bots).values(bot).returning();
  return created;
}

export async function getAllBots(): Promise<Bot[]> {
  const db = getDb();
  if (!db) return [];
  return await db.select().from(bots).orderBy(desc(bots.createdAt));
}

export async function getBotById(id: number): Promise<Bot | undefined> {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return result[0];
}

export async function updateBot(id: number, updates: Partial<Bot>): Promise<Bot> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const [updated] = await db
    .update(bots)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(bots.id, id))
    .returning();
  return updated;
}

// ── Deployability checks ──────────────────────────────────────────────

/**
 * A bot is deployable if:
 * - identity/config is valid (name, displayName)
 * - status is "configured" or "validated" or "deployable"
 * - no blockers remain
 */
export function isDeployable(bot: Bot): boolean {
  return getBlockingReasons(bot).length === 0 &&
    ["configured", "validated", "deployable"].includes(bot.status);
}

/** Returns blocking reasons preventing a bot from being catalog-importable */
export function getBlockingReasons(bot: Bot): string[] {
  const reasons: string[] = [];
  if (!bot.name) reasons.push("Bot name is required");
  if (bot.status === "draft") reasons.push("Bot is still in draft — configure it first");
  if (bot.status === "archived") reasons.push("Bot is archived");
  // Channel validation
  const channels = bot.channels ?? [];
  if (channels.length === 0) reasons.push("At least one channel is required");
  return reasons;
}
