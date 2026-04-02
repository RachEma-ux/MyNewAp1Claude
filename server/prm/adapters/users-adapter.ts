/**
 * Users Adapter — Resolve user IDs/names from main DB via getDb()
 *
 * Adapter pattern: PRMDB stores soft-reference user IDs.
 * This adapter resolves them against the main DB when display names are needed.
 */

import { getDb } from "../../db/connection";
import { eq } from "drizzle-orm";

export async function resolveUserName(userId: number): Promise<string> {
  try {
    const db = getDb();
    if (!db) return `User #${userId}`;
    const result = await db.execute(
      `SELECT username, display_name FROM users WHERE id = ${userId} LIMIT 1`
    );
    const row = (result as any)?.[0];
    return row?.display_name || row?.username || `User #${userId}`;
  } catch {
    return `User #${userId}`;
  }
}

export async function resolveUserNames(
  userIds: number[]
): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  for (const id of userIds) {
    if (id) result[id] = await resolveUserName(id);
  }
  return result;
}
