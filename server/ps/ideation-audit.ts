/**
 * PS Ideation — Audit Event Emitter
 */

import { getDb } from "../db/connection";
import { psIdeationActivity } from "../../drizzle/tables/ps";

export async function emitIdeationEvent(params: {
  ideationId: number;
  eventType: string;
  payload?: Record<string, unknown>;
  actorId?: number;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(psIdeationActivity).values({
      ideationId: params.ideationId,
      eventType: params.eventType,
      payloadJson: params.payload ?? null,
      actorId: params.actorId ?? null,
    });
  } catch (err) {
    console.warn(`[IdeationAudit] Failed to log ${params.eventType}: ${(err as Error).message}`);
  }
}
