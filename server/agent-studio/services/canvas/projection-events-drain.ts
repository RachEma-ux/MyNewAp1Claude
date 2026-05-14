/**
 * Canvas projection events drain orchestrator — V1+ 17-γ follow-up
 * (PR-V1-57).
 *
 * Composes the read helper from #807
 * (`readCanvasProjectionEventsAfter`) with a caller-supplied
 * forwarder so operators can wire the drain into ANY async runtime
 * (cron, queue worker, on-demand admin trigger) without coupling
 * this module to a scheduler. Stateless: cursor passes through;
 * caller decides persistence (process-local Map, dedicated table,
 * piggyback on workspace observability, etc.).
 *
 * Pattern: drain in batches of `limit` until either the reader
 * returns fewer than `limit` rows (genuine catch-up) OR the
 * operator-supplied `maxBatches` ceiling fires (defensive cap so
 * a runaway workspace can't monopolise the cron tick). Per-event
 * forward failures are caught + logged + DO NOT advance the
 * cursor past the failing row — the next tick retries. A genuine
 * poison-pill should be diagnosed via the WARN log + manually
 * skipped via cursor adjustment.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Read-only against `ags_canvas_projection_events` via the
 *     #807 reader; forwarding is the caller's responsibility.
 *   - Cursor never moves backward — each batch resolves the
 *     largest row id processed and returns it as the next cursor.
 */

import {
  readCanvasProjectionEventsAfter,
  type ReadCanvasProjectionEventsAfterOptions,
} from "./projection-events-reader.js";
import type { AgsCanvasProjectionEvent } from "../../../../drizzle/tables/agent-studio-canvas.js";

export type CanvasProjectionEventForwarder = (
  event: AgsCanvasProjectionEvent,
) => void | Promise<void>;

export interface DrainCanvasProjectionEventsForWorkspaceInput {
  readonly workspaceId: number;
  /** Starting cursor — return rows with `id > lastSeenId`. Use `0`
   *  for the first drain. */
  readonly lastSeenId: number;
  /** Per-event forwarder. Failures are caught (see policy above);
   *  if the forwarder needs at-least-once semantics it should
   *  implement its own retry on top of this. */
  readonly forward: CanvasProjectionEventForwarder;
  /** Batch size per reader call. Defaults to `100`. Capped at
   *  `READ_CANVAS_PROJECTION_EVENTS_HARD_LIMIT` (1000) by the
   *  reader. */
  readonly limit?: number;
  /** Defensive ceiling on total batches per drain call (so a
   *  runaway workspace can't monopolise a cron tick). Defaults
   *  to `10`. Minimum `1`. */
  readonly maxBatches?: number;
}

export interface DrainCanvasProjectionEventsForWorkspaceResult {
  readonly workspaceId: number;
  /** Cursor to feed back on the next drain. Equal to
   *  `input.lastSeenId` when no rows were processed. */
  readonly nextLastSeenId: number;
  /** Total rows processed (forwarder did not throw). */
  readonly processed: number;
  /** Rows where the forwarder threw — cursor stopped at the prior
   *  row so the next tick retries. Per the policy above, the
   *  drain returns AS SOON AS the first forwarder failure
   *  happens so the failing row blocks progress until resolved. */
  readonly failed: number;
  /** Batches that ran. Useful for operator telemetry. */
  readonly batchesRun: number;
  /** True iff the loop stopped because `maxBatches` was hit (more
   *  work may remain). False when the reader returned fewer than
   *  `limit` rows (genuine catch-up) OR a forwarder failed. */
  readonly hitMaxBatches: boolean;
}

export const DEFAULT_DRAIN_LIMIT = 100;
export const DEFAULT_DRAIN_MAX_BATCHES = 10;

/**
 * Drain `ags_canvas_projection_events` for a single workspace.
 * Stateless — caller provides + receives the cursor.
 */
export async function drainCanvasProjectionEventsForWorkspace(
  input: DrainCanvasProjectionEventsForWorkspaceInput,
  options: ReadCanvasProjectionEventsAfterOptions = {},
): Promise<DrainCanvasProjectionEventsForWorkspaceResult> {
  const limit = Math.max(1, Math.trunc(input.limit ?? DEFAULT_DRAIN_LIMIT));
  const maxBatches = Math.max(
    1,
    Math.trunc(input.maxBatches ?? DEFAULT_DRAIN_MAX_BATCHES),
  );

  let cursor = input.lastSeenId;
  let processed = 0;
  let failed = 0;
  let batchesRun = 0;
  let hitMaxBatches = false;

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await readCanvasProjectionEventsAfter(
      { workspaceId: input.workspaceId, lastSeenId: cursor, limit },
      options,
    );
    batchesRun++;
    if (rows.length === 0) break;

    let abortBatch = false;
    for (const row of rows) {
      try {
        await input.forward(row);
        cursor = row.id;
        processed++;
      } catch (err) {
        // Failure: cursor stays at the prior row so the next
        // drain tick retries the failing row. We stop the loop
        // immediately so a poison pill doesn't burn through the
        // entire batch with the same failure.
        failed++;
        console.warn(
          `[ags-canvas-projection-events-drain] forward failed at row id=${row.id} (workspaceId=${input.workspaceId}) — drain halted at cursor=${cursor}:`,
          err instanceof Error ? err.message : err,
        );
        abortBatch = true;
        break;
      }
    }
    if (abortBatch) break;

    // Reader returned fewer than `limit` rows — genuine catch-up;
    // no more work for now.
    if (rows.length < limit) break;

    // More rows likely available. Check ceiling.
    if (batch + 1 >= maxBatches) {
      hitMaxBatches = true;
    }
  }

  return {
    workspaceId: input.workspaceId,
    nextLastSeenId: cursor,
    processed,
    failed,
    batchesRun,
    hitMaxBatches,
  };
}
