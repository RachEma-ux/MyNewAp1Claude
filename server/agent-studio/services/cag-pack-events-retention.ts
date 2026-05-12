/**
 * CAG Pack Events — retention sweep service.
 *
 * Phase 22 follow-up #645. The `ags_cag_pack_events` table appends
 * one row per CAG capability pack lifecycle event ('pack_created' /
 * 'pack_marked_stale' / 'pack_archived' / 'pack_used' /
 * 'pack_validation_failed' / etc) via `services/cag/events.ts`. No
 * retention before this PR — rows accumulate forever even though the
 * forensic value of multi-month-old `pack_used` events is low.
 *
 * Mirrors pruneOldCatalogSyncLog (#633) shape — single timestamp +
 * optional union filters. Filters on `createdAt`.
 *
 * Per-row filters:
 *   - eventType (union)        — `pack_used` is the high-volume
 *                                 default; `pack_validation_failed`
 *                                 is rare-but-important so operators
 *                                 typically preserve it longer
 *   - eventSeverity (union)    — `info` / `warn` / `error`; ops
 *                                 usually want to preserve `error`
 *                                 rows longer than `info`
 *   - workspaceId (single|set) — tenant scoping
 *   - agentDraftId (single)    — scope a sweep to one agent's pack
 *                                 event trail
 *   - packId (single)          — scope a sweep to one pack's events
 *
 * Fail-soft contract on ASDB-null. Empty-array short-circuit BEFORE
 * the ASDB probe (canonical pattern).
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsCagPackEvents } from "../../../drizzle/tables/agent-studio.js";

export type CagPackEventSeverity = "info" | "warn" | "error";

export interface PruneOldCagPackEventsInput {
  readonly olderThan: Date;
  /**
   * Restrict to these event types. Default: all (no filter).
   * Operators typically scope to high-volume `pack_used` rows.
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly eventTypes?: readonly string[];
  /**
   * Restrict to these severities. Default: all. Operators typically
   * scope to `["info"]` to preserve `warn` + `error` longer.
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly eventSeverities?: readonly CagPackEventSeverity[];
  /**
   * Restrict to a single workspace (`eq`) or a set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly workspaceId?: number | readonly number[];
  /** Restrict to a specific agent draft. */
  readonly agentDraftId?: number;
  /** Restrict to a specific pack. */
  readonly packId?: number;
}

export interface PruneOldCagPackEventsResult {
  readonly deletedCount: number;
}

export interface PruneOldCagPackEventsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldCagPackEvents(
  input: PruneOldCagPackEventsInput,
  options: PruneOldCagPackEventsOptions = {},
): Promise<PruneOldCagPackEventsResult> {
  if (Array.isArray(input.eventTypes) && input.eventTypes.length === 0) {
    return { deletedCount: 0 };
  }
  if (
    Array.isArray(input.eventSeverities) &&
    input.eventSeverities.length === 0
  ) {
    return { deletedCount: 0 };
  }
  if (Array.isArray(input.workspaceId) && input.workspaceId.length === 0) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const filters = [lt(agsCagPackEvents.createdAt, input.olderThan)];

  const evtInput = input.eventTypes;
  if (evtInput !== undefined) {
    filters.push(inArray(agsCagPackEvents.eventType, evtInput as string[]));
  }
  const sevInput = input.eventSeverities;
  if (sevInput !== undefined) {
    filters.push(
      inArray(
        agsCagPackEvents.eventSeverity,
        sevInput as CagPackEventSeverity[],
      ),
    );
  }
  const wsInput = input.workspaceId;
  if (wsInput !== undefined) {
    if (Array.isArray(wsInput)) {
      filters.push(inArray(agsCagPackEvents.workspaceId, wsInput));
    } else {
      filters.push(eq(agsCagPackEvents.workspaceId, wsInput as number));
    }
  }
  if (input.agentDraftId !== undefined) {
    filters.push(eq(agsCagPackEvents.agentDraftId, input.agentDraftId));
  }
  if (input.packId !== undefined) {
    filters.push(eq(agsCagPackEvents.packId, input.packId));
  }

  const deleted = await db
    .delete(agsCagPackEvents)
    .where(and(...filters))
    .returning({ id: agsCagPackEvents.id });

  return { deletedCount: deleted.length };
}
