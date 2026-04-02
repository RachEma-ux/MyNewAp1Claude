/**
 * PS Adapter — Resolve PS project references from main DB
 */

import { getDb } from "../../db/connection";

export async function resolveProjectName(projectId: number): Promise<string> {
  try {
    const db = getDb();
    if (!db) return `Project #${projectId}`;
    const result = await db.execute(
      `SELECT name FROM ps_systems WHERE id = ${projectId} LIMIT 1`
    );
    const row = (result as any)?.[0];
    return row?.name || `Project #${projectId}`;
  } catch {
    return `Project #${projectId}`;
  }
}
