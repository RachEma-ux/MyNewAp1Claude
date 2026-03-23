/**
 * HR Lifecycle Event Logger — Records state transitions for audit trail
 */

import { getDb } from "../../db/connection";
import { hrLifecycleEvents } from "../../../drizzle/schema";

export async function logLifecycleEvent(params: {
  entityType: string;
  entityId: number;
  event: string;
  fromStatus?: string;
  toStatus?: string;
  actorId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(hrLifecycleEvents).values(params);
  } catch (err) {
    console.warn(`[HR Lifecycle] Failed to log event: ${(err as Error).message}`);
  }
}
