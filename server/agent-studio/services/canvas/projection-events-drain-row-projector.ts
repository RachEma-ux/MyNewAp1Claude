/**
 * Canvas projection events — DB row → in-memory event projector.
 * V1+ 17-γ follow-up (PR-V1-67).
 *
 * Bridges the persistence layer (`ags_canvas_projection_events` rows
 * surfaced by #807 reader and #808-#811 drain helpers) and the
 * in-memory event taxonomy that the canvas-service originally
 * emitted (`CanvasProjectionEvent` from `projection-events-sink.ts`).
 *
 * Reconstructs the original event shape from a drained row so an
 * operator-supplied forwarder can hand the event to any downstream
 * (ProjectionSyncWorker, an external queue producer, a log-only
 * audit sink, etc.) without re-implementing the row→event
 * de-serialization. Pure function — no I/O, no module state.
 *
 * The DB-row `kind` column stores the short suffix
 * (`"note_reference_changed"` / `"note_reference_removed"`) per the
 * sink writer (#805), so this projector handles the suffix→full-kind
 * remap.
 *
 * The drain forwarder (#808) wraps the projector + the downstream
 * dispatch — see PR-V1-67 ledger row + the companion
 * `projection-events-drain-projecting-forwarder.ts` factory.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Type-only imports of the DB row + event shape.
 *   - No `ProjectionSyncWorker` import — the operator binds their
 *     worker at boot, not through this module.
 */

import type { AgsCanvasProjectionEvent } from "../../../../drizzle/tables/agent-studio-canvas.js";
import type { CanvasProjectionEvent } from "./projection-events-sink.js";

export const CANVAS_PROJECTION_EVENT_ROW_KINDS = [
  "note_reference_changed",
  "note_reference_removed",
] as const;

export type CanvasProjectionEventRowKind =
  (typeof CANVAS_PROJECTION_EVENT_ROW_KINDS)[number];

/**
 * Project a drained `ags_canvas_projection_events` row back to the
 * original `CanvasProjectionEvent` shape.
 *
 * Returns `null` when the row is structurally unprojectable:
 *   - `kind` is not in the closed row-kind taxonomy.
 *   - `kind === "note_reference_changed"` but `referencedNoteId` is
 *     null (the sink writer guarantees a non-null value for this
 *     kind — a null indicates schema drift; defensive drop).
 *   - `kind === "note_reference_removed"` but `referencedNoteId` is
 *     null (the sink writer stores the prior-noteId here).
 *
 * Defensive `null` instead of `throw` so the drain forwarder can
 * advance the cursor past structurally-broken rows on its own
 * cadence (operator surfaces the warn-log).
 */
export function projectAgsCanvasProjectionEventRow(
  row: AgsCanvasProjectionEvent,
): CanvasProjectionEvent | null {
  const kind = row.kind;
  if (!isKnownRowKind(kind)) {
    return null;
  }
  if (row.referencedNoteId == null) {
    return null;
  }
  if (kind === "note_reference_changed") {
    return {
      kind: "canvas.note_reference_changed",
      payload: {
        canvasId: row.canvasId,
        canvasNodeId: row.canvasNodeId,
        referencedNoteId: row.referencedNoteId,
      },
    };
  }
  return {
    kind: "canvas.note_reference_removed",
    payload: {
      canvasId: row.canvasId,
      canvasNodeId: row.canvasNodeId,
      priorReferencedNoteId: row.referencedNoteId,
    },
  };
}

function isKnownRowKind(kind: string): kind is CanvasProjectionEventRowKind {
  return (CANVAS_PROJECTION_EVENT_ROW_KINDS as readonly string[]).includes(
    kind,
  );
}
