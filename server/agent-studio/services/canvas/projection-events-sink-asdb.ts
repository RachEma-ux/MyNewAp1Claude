/**
 * Canvas → graph projection events — ASDB-backed sink (PR-V1-54).
 *
 * Persists `CanvasProjectionEvent` rows to the
 * `ags_canvas_projection_events` table introduced by PR-V1-53
 * (#804). Composed with the sink registry from PR-V1-41 (#792) via
 * `registerCanvasProjectionEventSink(createAsdbCanvasProjectionEventSink())`.
 *
 * Workspace resolution:
 *   - The sink event shape does NOT carry `workspaceId` (canvas
 *     events naturally know vault → workspace, not the reverse).
 *   - The default resolver queries `agsCanvases.vaultId` →
 *     `agsVaults.workspaceId` for the given `canvasId`. A test seam
 *     (`resolveWorkspaceId`) injects a closure so unit tests
 *     bypass ASDB entirely.
 *
 * Defensive posture:
 *   - When the workspace can't be resolved (canvas missing or
 *     vault.workspaceId null), the sink WARNs and drops the event
 *     rather than inserting a synthetic 0/-1 row. The
 *     `agsCanvasProjectionEvents.workspaceId` column is notNull;
 *     a synthetic value would corrupt retention + multi-region
 *     queries that filter by workspaceId.
 *   - ASDB-unavailable: WARN + drop (consistent with the no-op
 *     default sink). The registry wrapper already catches sink
 *     throws — but we surface the WARN here for triage.
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Reads `agsCanvases`/`agsVaults` for workspaceId; writes
 *     ONLY `agsCanvasProjectionEvents`. Append-only by contract.
 */

import { and, eq } from "drizzle-orm";

import type { CanvasProjectionEvent, CanvasProjectionEventSink } from "./projection-events-sink.js";

export interface CreateAsdbCanvasProjectionEventSinkOptions {
  /**
   * Test seam — override the DB accessor. Production defaults to
   * `getAsDb()`.
   */
  readonly getDb?: () =>
    | { insert: unknown; select: unknown } // narrow structural type
    | null;
  /**
   * Test seam — override the workspaceId resolver. Production
   * defaults to a JOIN against `agsCanvases` / `agsVaults`. Return
   * `null` to drop the event.
   */
  readonly resolveWorkspaceId?: (
    canvasId: number,
  ) => Promise<number | null>;
}

export function createAsdbCanvasProjectionEventSink(
  options: CreateAsdbCanvasProjectionEventSinkOptions = {},
): CanvasProjectionEventSink {
  return async (event: CanvasProjectionEvent): Promise<void> => {
    const canvasId = event.payload.canvasId;
    const canvasNodeId = event.payload.canvasNodeId;
    const referencedNoteId =
      event.kind === "canvas.note_reference_changed"
        ? event.payload.referencedNoteId
        : event.payload.priorReferencedNoteId;

    // Lazy import the DB + tables only when invoked so unit tests
    // that never call the sink don't pay the ASDB import cost.
    const { agsCanvasProjectionEvents } = await import(
      "../../../../drizzle/tables/agent-studio-canvas.js"
    );

    let workspaceId: number | null;
    try {
      workspaceId = await (options.resolveWorkspaceId ??
        defaultResolveWorkspaceId)(canvasId);
    } catch (err) {
      console.warn(
        "[ags-canvas-projection-asdb] workspaceId resolve threw — event dropped:",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (workspaceId == null) {
      console.warn(
        `[ags-canvas-projection-asdb] no workspaceId for canvasId=${canvasId} — event dropped`,
      );
      return;
    }

    const db = (options.getDb ?? (await loadDefaultGetDb()))();
    if (!db) {
      console.warn(
        "[ags-canvas-projection-asdb] ASDB unavailable — event dropped",
      );
      return;
    }

    const kindString =
      event.kind === "canvas.note_reference_changed"
        ? "note_reference_changed"
        : "note_reference_removed";

    await (db as {
      insert: (
        t: typeof agsCanvasProjectionEvents,
      ) => {
        values: (v: Record<string, unknown>) => Promise<void> | unknown;
      };
    })
      .insert(agsCanvasProjectionEvents)
      .values({
        kind: kindString,
        workspaceId,
        canvasId,
        canvasNodeId,
        referencedNoteId,
      });
  };
}

async function loadDefaultGetDb(): Promise<
  () => { insert: unknown; select: unknown } | null
> {
  const mod = await import("../../db/connection.js");
  return mod.getAsDb as unknown as () => {
    insert: unknown;
    select: unknown;
  } | null;
}

async function defaultResolveWorkspaceId(
  canvasId: number,
): Promise<number | null> {
  const [{ agsCanvases }, { agsVaults }, { getAsDb }] = await Promise.all([
    import("../../../../drizzle/tables/agent-studio-canvas.js"),
    import("../../../../drizzle/tables/agent-studio-vault.js"),
    import("../../db/connection.js"),
  ]);
  const db = getAsDb();
  if (!db) return null;
  const rows = await db
    .select({ workspaceId: agsVaults.workspaceId })
    .from(agsCanvases)
    .innerJoin(agsVaults, eq(agsCanvases.vaultId, agsVaults.id))
    .where(and(eq(agsCanvases.id, canvasId)))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].workspaceId ?? null;
}
