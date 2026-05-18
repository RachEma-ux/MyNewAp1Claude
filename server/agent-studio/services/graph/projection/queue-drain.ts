/**
 * Graph Projection Queue Drain.
 *
 * Bridges producer-side `enqueueProjectionJob(...)` writes (vault note
 * CRUD via PRs #1477 + #1478; graph-correction proposals via the
 * repository-backed applier; etc.) to the consumer-side
 * `ProjectionSyncWorker.handle(event)`. Before this module existed,
 * pending rows in `ags_graph_projection_sync_jobs` had no consumer —
 * the queue grew unboundedly and the graph never updated.
 *
 * Responsibilities:
 *   1. Read pending rows (status='pending') ordered by id ASC.
 *   2. For each row: translate `(triggerEvent, triggerPayload)` to a
 *      typed `ProjectionEvent` via a closed-taxonomy lookup. Unknown
 *      event kinds skip with status='unknown_event_kind' so the queue
 *      doesn't stall on them (operator triage via Postgres directly).
 *   3. Run the event through `ProjectionSyncWorker.handle`. The
 *      worker writes to Neo4j and returns `{status, writes, errors}`.
 *   4. Flip `status` to 'completed' (zero errors) or 'failed' (errors
 *      present); stamp `completedAt`. Failed rows surface in the
 *      staleness-cron + drift-cron operator surfaces.
 *
 * Pure-orchestration design: every external dependency (row fetcher,
 * sync worker, status updater) is injected via the options bag, so
 * unit tests can verify the dispatch logic without ASDB or Neo4j.
 * Production callers (the follow-on cron + admin tRPC) use the
 * default ASDB-backed loaders.
 *
 * Failure-tolerance: a single bad row never poisons the drain. The
 * orchestrator catches per-row exceptions, records them in the
 * returned summary, and continues to the next row.
 */

import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { getAsDb } from "../../../db/connection.js";
import { agsGraphProjectionSyncJobs } from "../../../../../drizzle/tables/agent-studio-graph-projection.js";
import { ProjectionSyncWorker } from "./sync-worker.js";
import type { ProjectionEvent } from "./sync-worker.js";
import { getGraphRepository } from "../repository/index.js";
import type { GraphRepository } from "../repository/types.js";

// ---------------------------------------------------------------------------
// Row shape + translation surface
// ---------------------------------------------------------------------------

export interface PendingProjectionJobRow {
  readonly id: number;
  readonly projectionKey: string;
  readonly triggerEvent: string;
  readonly triggerPayload: Record<string, unknown> | null;
}

export type ProjectionRowStatus = "completed" | "failed" | "unknown_event_kind";

export interface DrainOutcome {
  readonly rowId: number;
  readonly status: ProjectionRowStatus;
  readonly writes: number;
  readonly errors: string[];
  readonly durationMs: number;
}

export interface DrainSummary {
  readonly processed: number;
  readonly completed: number;
  readonly failed: number;
  readonly unknownEventKind: number;
  readonly outcomes: DrainOutcome[];
}

export interface DrainOptions {
  /** Maximum rows to drain in one pass. Default 100. */
  readonly limit?: number;
  /** Test seam — replace the pending-row loader. */
  readonly fetchPending?: (limit: number) => Promise<PendingProjectionJobRow[]>;
  /** Test seam — replace the status updater. */
  readonly updateRowStatus?: (
    rowId: number,
    status: ProjectionRowStatus,
    lastError: string | null,
  ) => Promise<void>;
  /** Test seam — replace the sync worker. */
  readonly worker?: ProjectionSyncWorker;
  /** Test seam — replace the GraphRepository the default worker uses. */
  readonly repository?: GraphRepository;
}

// ---------------------------------------------------------------------------
// triggerEvent → ProjectionEvent translation
// ---------------------------------------------------------------------------

/**
 * Closed-taxonomy translator. Each branch validates the payload
 * shape (presence + types) before constructing the event; missing
 * fields surface as null and the orchestrator skips with
 * status='failed'+lastError rather than crashing.
 *
 * Adding a new event kind: append a case here AND a case in
 * `sync-worker.ts`'s `buildWrites` switch.
 */
export function translatePendingRowToEvent(
  row: PendingProjectionJobRow,
): ProjectionEvent | null {
  const payload = (row.triggerPayload ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = payload[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = (k: string): string | null => {
    const v = payload[k];
    return typeof v === "string" ? v : null;
  };

  switch (row.triggerEvent) {
    case "note.created":
    case "note.updated": {
      const noteId = num("noteId");
      const vaultId = num("vaultId");
      const slug = str("slug");
      const title = str("title");
      const versionId = num("versionId");
      if (
        noteId == null ||
        vaultId == null ||
        slug == null ||
        title == null ||
        versionId == null
      ) {
        return null;
      }
      return {
        kind: row.triggerEvent,
        payload: { noteId, vaultId, slug, title, versionId },
      };
    }
    case "note.deleted": {
      const noteId = num("noteId");
      if (noteId == null) return null;
      return { kind: "note.deleted", payload: { noteId } };
    }
    case "wikilink.changed": {
      const sourceNoteId = num("sourceNoteId");
      const sourceVersionId = num("sourceVersionId");
      const targetSlug = str("targetSlug");
      const targetNoteId = num("targetNoteId");
      if (sourceVersionId == null || targetSlug == null) return null;
      return {
        kind: "wikilink.changed",
        payload: {
          sourceNoteId: sourceNoteId ?? 0,
          sourceVersionId,
          targetSlug,
          targetNoteId,
        },
      };
    }
    // Phase 24 — Bases MVP (T-F.2) -------------------------------------
    case "base.created":
    case "base.updated": {
      const baseId = num("baseId");
      const slug = str("slug");
      const name = str("name");
      if (baseId == null || slug == null || name == null) return null;
      return {
        kind: row.triggerEvent,
        payload: {
          baseId,
          workspaceId: num("workspaceId"),
          vaultId: num("vaultId"),
          slug,
          name,
        },
      };
    }
    case "base.deleted": {
      const baseId = num("baseId");
      if (baseId == null) return null;
      return { kind: "base.deleted", payload: { baseId } };
    }
    case "base.row_changed": {
      const rowId = num("rowId");
      const baseId = num("baseId");
      if (rowId == null || baseId == null) return null;
      return {
        kind: "base.row_changed",
        payload: { rowId, baseId, noteId: num("noteId") },
      };
    }
    case "base.row_removed": {
      const rowId = num("rowId");
      if (rowId == null) return null;
      return { kind: "base.row_removed", payload: { rowId } };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Default ASDB-backed loaders
// ---------------------------------------------------------------------------

/**
 * Maximum retry attempts for a failed row before the drain stops
 * re-attempting it. After this many failures the row stays in
 * `failed` status indefinitely; operator intervention (manual
 * reset or `runDrainNow` via the admin tRPC after fixing the
 * underlying issue) is required.
 *
 * 3 attempts is a deliberately small cap — most transient failures
 * (Neo4j brief unavailability, deadlock retry) recover within the
 * first 1-2 retries; persistent failures (bad payload, type
 * mismatch, schema drift) shouldn't burn cycles on perpetual retry.
 */
export const MAX_DRAIN_RETRY_ATTEMPTS = 3;

async function defaultFetchPending(
  limit: number,
): Promise<PendingProjectionJobRow[]> {
  const db = getAsDb();
  if (!db) return [];
  // Include both fresh-pending rows AND failed rows under the retry
  // cap. The drain re-attempts them; on success they flip to
  // 'completed', on failure retry_count increments and they stay
  // 'failed' (and re-appear on the next pass until exhausted).
  const rows = await db
    .select({
      id: agsGraphProjectionSyncJobs.id,
      projectionKey: agsGraphProjectionSyncJobs.projectionKey,
      triggerEvent: agsGraphProjectionSyncJobs.triggerEvent,
      triggerPayload: agsGraphProjectionSyncJobs.triggerPayload,
    })
    .from(agsGraphProjectionSyncJobs)
    .where(
      or(
        eq(agsGraphProjectionSyncJobs.status, "pending"),
        and(
          eq(agsGraphProjectionSyncJobs.status, "failed"),
          lt(
            agsGraphProjectionSyncJobs.retryCount,
            MAX_DRAIN_RETRY_ATTEMPTS,
          ),
        ),
      ),
    )
    .orderBy(asc(agsGraphProjectionSyncJobs.id))
    .limit(limit);
  return rows.map((r) => ({
    id: Number(r.id),
    projectionKey: String(r.projectionKey),
    triggerEvent: String(r.triggerEvent),
    triggerPayload: (r.triggerPayload as Record<string, unknown> | null) ?? null,
  }));
}

async function defaultUpdateRowStatus(
  rowId: number,
  status: ProjectionRowStatus,
  lastError: string | null,
): Promise<void> {
  const db = getAsDb();
  if (!db) return;
  // Increment retry_count when transitioning to 'failed' (whether
  // first failure or N-th retry); keep it stable on completed /
  // unknown_event_kind. Postgres-side increment keeps the
  // orchestrator stateless re: retry bookkeeping.
  const set =
    status === "failed"
      ? {
          status,
          lastError,
          retryCount: sql`${agsGraphProjectionSyncJobs.retryCount} + 1`,
          completedAt: new Date(),
          updatedAt: new Date(),
        }
      : {
          status,
          lastError,
          completedAt: new Date(),
          updatedAt: new Date(),
        };
  await db
    .update(agsGraphProjectionSyncJobs)
    .set(set)
    .where(eq(agsGraphProjectionSyncJobs.id, rowId));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Drains up to `limit` pending projection rows. Returns a summary
 * of per-row outcomes (rolled up into 4 counts). Designed for both
 * cron + admin-triggered manual invocation.
 *
 * Idempotency: rows transition pending → (completed | failed |
 * unknown_event_kind). Successful drain never re-processes the same
 * row. A row that fails repeatedly stays in 'failed' state; operator
 * intervention (or a future retry-with-backoff slice) re-arms it.
 */
export async function drainPendingProjectionJobs(
  options: DrainOptions = {},
): Promise<DrainSummary> {
  const limit = options.limit ?? 100;
  const fetchPending = options.fetchPending ?? defaultFetchPending;
  const updateRowStatus = options.updateRowStatus ?? defaultUpdateRowStatus;
  const worker =
    options.worker ??
    new ProjectionSyncWorker({
      repository: options.repository ?? getGraphRepository(),
    });

  const rows = await fetchPending(limit);
  const outcomes: DrainOutcome[] = [];
  let completed = 0;
  let failed = 0;
  let unknownEventKind = 0;

  for (const row of rows) {
    const startedAt = Date.now();
    const event = translatePendingRowToEvent(row);
    if (event == null) {
      const err = `unknown event kind or malformed payload: ${row.triggerEvent}`;
      await safeUpdateStatus(updateRowStatus, row.id, "unknown_event_kind", err);
      unknownEventKind++;
      outcomes.push({
        rowId: row.id,
        status: "unknown_event_kind",
        writes: 0,
        errors: [err],
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    try {
      const result = await worker.handle(event);
      const status: ProjectionRowStatus =
        result.status === "completed" ? "completed" : "failed";
      await safeUpdateStatus(
        updateRowStatus,
        row.id,
        status,
        result.errors.length > 0 ? result.errors.join("; ") : null,
      );
      if (status === "completed") completed++;
      else failed++;
      outcomes.push({
        rowId: row.id,
        status,
        writes: result.writes,
        errors: result.errors,
        durationMs: result.durationMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await safeUpdateStatus(updateRowStatus, row.id, "failed", msg);
      failed++;
      outcomes.push({
        rowId: row.id,
        status: "failed",
        writes: 0,
        errors: [msg],
        durationMs: Date.now() - startedAt,
      });
    }
  }

  return {
    processed: rows.length,
    completed,
    failed,
    unknownEventKind,
    outcomes,
  };
}

async function safeUpdateStatus(
  updateRowStatus: NonNullable<DrainOptions["updateRowStatus"]>,
  rowId: number,
  status: ProjectionRowStatus,
  lastError: string | null,
): Promise<void> {
  try {
    await updateRowStatus(rowId, status, lastError);
  } catch (e) {
    // A status-update failure is logged but does not poison the
    // drain — the next pass will see the row still 'pending' and
    // re-attempt. Idempotency is preserved by the sync-worker's
    // upsert semantics.
    console.warn(
      `[queue-drain] status update failed rowId=${rowId} status=${status}:`,
      e,
    );
  }
}

