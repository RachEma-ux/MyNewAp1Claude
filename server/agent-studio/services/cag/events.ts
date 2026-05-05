/**
 * CAG event log — append-only writer for `ags_cag_pack_events`.
 *
 * No reads here; queries against the event log live in P1D backend
 * preview APIs and P7 trace integration.
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import { agsCagPackEvents } from "../../../../drizzle/tables/agent-studio";
import type { AppendEventInput, CagPackEvent } from "./types";

function rowToEvent(row: typeof agsCagPackEvents.$inferSelect): CagPackEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentDraftId: row.agentDraftId,
    packId: row.packId ?? null,
    eventType: row.eventType,
    eventSeverity: row.eventSeverity as CagPackEvent["eventSeverity"],
    reason: row.reason ?? null,
    oldHash: row.oldHash ?? null,
    newHash: row.newHash ?? null,
    runtimeRunId: row.runtimeRunId ?? null,
    actorType: row.actorType ?? null,
    sourceType: row.sourceType ?? null,
    packVersion: row.packVersion ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    metadataJson: (row.metadataJson ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Append a single event row. Best-effort: a failed insert MUST log
 * via console.warn but MUST NOT throw — pack events are observability,
 * not source of truth.
 */
export async function appendPackEvent(input: AppendEventInput): Promise<void> {
  const db = getAsDb();
  if (!db) return;

  try {
    await db.insert(agsCagPackEvents).values({
      workspaceId: input.workspaceId,
      agentDraftId: input.agentDraftId,
      packId: input.packId ?? null,
      eventType: input.eventType,
      eventSeverity: input.eventSeverity ?? "info",
      reason: input.reason ?? null,
      oldHash: input.oldHash ?? null,
      newHash: input.newHash ?? null,
      runtimeRunId: input.runtimeRunId ?? null,
      actorType: input.actorType ?? null,
      sourceType: input.sourceType ?? null,
      packVersion: input.packVersion ?? null,
      createdBy: input.createdBy ?? null,
      metadataJson: input.metadata ?? null,
    });
  } catch (err) {
    console.warn(
      `[cag/events] failed to append pack event ${input.eventType}:`,
      err,
    );
  }
}

/**
 * List events for a draft, newest first. Limit defaults to 100.
 */
export async function listPackEvents(
  agentDraftId: number,
  limit = 100,
): Promise<CagPackEvent[]> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagPackEvents)
    .where(eq(agsCagPackEvents.agentDraftId, agentDraftId))
    .orderBy(desc(agsCagPackEvents.createdAt))
    .limit(limit);

  return rows.map(rowToEvent);
}

/**
 * List events for a specific pack id, newest first.
 */
export async function listEventsByPack(
  workspaceId: number,
  packId: number,
  limit = 100,
): Promise<CagPackEvent[]> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const rows = await db
    .select()
    .from(agsCagPackEvents)
    .where(
      and(
        eq(agsCagPackEvents.workspaceId, workspaceId),
        eq(agsCagPackEvents.packId, packId),
      ),
    )
    .orderBy(desc(agsCagPackEvents.createdAt))
    .limit(limit);

  return rows.map(rowToEvent);
}
