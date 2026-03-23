/**
 * HR Audit — Shared audit logging for HR mutations
 */

import { getDb } from "../db/connection";
import { hrAuditLog } from "../../drizzle/schema";

export async function logHrAudit(params: {
  actorId?: number;
  workspaceId?: number;
  targetWorkerId?: number;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(hrAuditLog).values(params);
  } catch (err) {
    console.warn(`[HR Audit] Failed to log: ${(err as Error).message}`);
  }
}
