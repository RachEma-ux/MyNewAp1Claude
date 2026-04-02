/**
 * PM Adapter — Resolve PM Central work item references from main DB
 */

import { getDb } from "../../db/connection";

export async function resolveWorkItemName(workItemId: number): Promise<string> {
  try {
    const db = getDb();
    if (!db) return `Work Item #${workItemId}`;
    const result = await db.execute(
      `SELECT title FROM pm_work_items WHERE id = ${workItemId} LIMIT 1`
    );
    const row = (result as any)?.[0];
    return row?.title || `Work Item #${workItemId}`;
  } catch {
    return `Work Item #${workItemId}`;
  }
}
