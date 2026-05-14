/**
 * Canvas projection events drain fan-out — V1+ 17-γ follow-up
 * (PR-V1-58).
 *
 * Composes the per-workspace drain (`drainCanvasProjectionEventsForWorkspace`
 * from #808) across N workspaces in a single tick. Operator-supplied
 * cursor map = `Map<workspaceId, lastSeenId>` is mutated in place
 * so the next tick picks up where this tick left off.
 *
 * Workspace discovery:
 *   - Caller supplies `getWorkspaceIds()` returning the list of
 *     workspaces to drain.
 *   - Default helper `defaultListActiveProjectionWorkspaces` queries
 *     `SELECT DISTINCT workspaceId FROM agsCanvasProjectionEvents`
 *     so new workspaces show up automatically without a separate
 *     registration step.
 *
 * Per-workspace failures are isolated — one workspace's drain
 * halting (forwarder throw, ASDB transient) does NOT prevent the
 * other workspaces from draining this tick. Aggregate stats
 * surface the per-workspace breakdown so cron telemetry can
 * highlight the workspaces stalled at the same cursor across
 * ticks.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Read-only against `ags_canvas_projection_events`.
 */

import {
  drainCanvasProjectionEventsForWorkspace,
  type CanvasProjectionEventForwarder,
  type DrainCanvasProjectionEventsForWorkspaceResult,
} from "./projection-events-drain.js";
import type { ReadCanvasProjectionEventsAfterOptions } from "./projection-events-reader.js";

export interface DrainCanvasProjectionEventsAllWorkspacesInput {
  /** Mutated in place. Cursor map keyed by workspaceId. Missing
   *  keys default to `0` (first-drain). Pass a fresh `Map` on
   *  process boot; survive ticks by retaining the reference. */
  readonly cursorMap: Map<number, number>;
  /** Per-event forwarder. Same contract as the per-workspace
   *  drain: throw halts the workspace's drain at the last
   *  successful row. Other workspaces continue draining. */
  readonly forward: CanvasProjectionEventForwarder;
  /** Test seam / explicit operator override. Defaults to the
   *  distinct-workspace SELECT against `agsCanvasProjectionEvents`. */
  readonly getWorkspaceIds?: () => Promise<readonly number[]>;
  /** Pass-through to the per-workspace drain. */
  readonly limit?: number;
  /** Pass-through to the per-workspace drain. */
  readonly maxBatchesPerWorkspace?: number;
}

export interface DrainCanvasProjectionEventsAllWorkspacesResult {
  readonly workspacesScanned: number;
  readonly totalProcessed: number;
  readonly totalFailed: number;
  /** Aggregate hitMaxBatches across workspaces (true if ANY
   *  workspace hit the ceiling — more work likely available next
   *  tick). */
  readonly anyHitMaxBatches: boolean;
  /** Per-workspace breakdown for telemetry. Empty when no
   *  workspaces returned from `getWorkspaceIds`. */
  readonly perWorkspace: readonly DrainCanvasProjectionEventsForWorkspaceResult[];
}

export async function drainCanvasProjectionEventsAllWorkspaces(
  input: DrainCanvasProjectionEventsAllWorkspacesInput,
  options: ReadCanvasProjectionEventsAfterOptions = {},
): Promise<DrainCanvasProjectionEventsAllWorkspacesResult> {
  const getWorkspaceIds =
    input.getWorkspaceIds ??
    (() => defaultListActiveProjectionWorkspaces(options));

  let workspaceIds: readonly number[];
  try {
    workspaceIds = await getWorkspaceIds();
  } catch (err) {
    console.warn(
      "[ags-canvas-projection-events-drain-fanout] workspace discovery failed — tick skipped:",
      err instanceof Error ? err.message : err,
    );
    return {
      workspacesScanned: 0,
      totalProcessed: 0,
      totalFailed: 0,
      anyHitMaxBatches: false,
      perWorkspace: [],
    };
  }

  const perWorkspace: DrainCanvasProjectionEventsForWorkspaceResult[] = [];
  let totalProcessed = 0;
  let totalFailed = 0;
  let anyHitMaxBatches = false;

  for (const workspaceId of workspaceIds) {
    const lastSeenId = input.cursorMap.get(workspaceId) ?? 0;
    try {
      const result = await drainCanvasProjectionEventsForWorkspace(
        {
          workspaceId,
          lastSeenId,
          forward: input.forward,
          limit: input.limit,
          maxBatches: input.maxBatchesPerWorkspace,
        },
        options,
      );
      perWorkspace.push(result);
      // Mutate cursor map in place — survives across ticks via
      // the caller's retained reference.
      input.cursorMap.set(workspaceId, result.nextLastSeenId);
      totalProcessed += result.processed;
      totalFailed += result.failed;
      if (result.hitMaxBatches) anyHitMaxBatches = true;
    } catch (err) {
      // Defensive: the per-workspace drain itself shouldn't throw
      // (it catches forwarder failures internally), but a reader
      // outage could surface here. Isolate the failure so the
      // remaining workspaces still drain.
      console.warn(
        `[ags-canvas-projection-events-drain-fanout] workspace ${workspaceId} drain threw — moving on:`,
        err instanceof Error ? err.message : err,
      );
      // Cursor map stays unchanged for this workspace — next tick
      // retries from the same point.
    }
  }

  return {
    workspacesScanned: workspaceIds.length,
    totalProcessed,
    totalFailed,
    anyHitMaxBatches,
    perWorkspace,
  };
}

/**
 * Default workspace discovery — distinct workspaceIds present in
 * `ags_canvas_projection_events`. Returns `[]` when ASDB is
 * unavailable so the fan-out treats it as a no-op tick.
 */
export async function defaultListActiveProjectionWorkspaces(
  options: ReadCanvasProjectionEventsAfterOptions = {},
): Promise<readonly number[]> {
  const { agsCanvasProjectionEvents } = await import(
    "../../../../drizzle/tables/agent-studio-canvas.js"
  );

  const db =
    options.getDb != null
      ? options.getDb()
      : (await loadDefaultGetDb())();
  if (!db) return [];

  const rows = await (db as {
    selectDistinct: (shape: Record<string, unknown>) => {
      from: (t: typeof agsCanvasProjectionEvents) => Promise<
        ReadonlyArray<{ workspaceId: number }>
      >;
    };
  })
    .selectDistinct({ workspaceId: agsCanvasProjectionEvents.workspaceId })
    .from(agsCanvasProjectionEvents);

  return rows.map((r) => r.workspaceId);
}

async function loadDefaultGetDb() {
  const mod = await import("../../db/connection.js");
  return mod.getAsDb as unknown as () => unknown;
}
