/**
 * Canvas projection events — projecting drain forwarder factory.
 * V1+ 17-γ follow-up (PR-V1-67 companion).
 *
 * Builds a `CanvasProjectionEventForwarder` (the row-shaped callback
 * the #808 drain hands rows to) by composing:
 *
 *   1. `projectAgsCanvasProjectionEventRow` (this module's sibling)
 *      — DB-row → `CanvasProjectionEvent`.
 *   2. An operator-supplied `dispatch(event)` closure that decides
 *      where the in-memory event goes (ProjectionSyncWorker handle,
 *      an external queue, a log-only audit sink, etc.).
 *
 * The forwarder is the integration boundary between the persistence
 * sink (#804 schema + #805 writer) and the downstream consumers.
 * Keeping the boundary as a pure factory means:
 *   - The canvas service module never imports
 *     `ProjectionSyncWorker` / `GraphRepository` (preserves the
 *     hard-rule boundary scan).
 *   - Operators can wire the same drain to multiple downstreams
 *     concurrently by composing multiple `dispatch` closures.
 *   - Tests can install a synthetic `dispatch` stub.
 *
 * Defensive contract:
 *   - Unprojectable rows (projector returns `null`) → emit a WARN
 *     and resolve. The drain MUST still advance its cursor past
 *     these rows (the alternative is a poison-pill that blocks
 *     all subsequent rows). Operator surfaces the WARN log.
 *   - `dispatch` throw → propagates so the drain (#808) treats it
 *     as a forwarder failure (drain halts at the failing row;
 *     cursor stays at the LAST SUCCESSFUL row id). This matches
 *     the documented #808 semantics and gives operators retry on
 *     transient downstream failures.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - No `ProjectionSyncWorker` import — operators bind it at boot
 *     by passing `event => worker.handle(toProjectionEvent(event))`
 *     (or any other binding) as `dispatch`.
 */

import type { AgsCanvasProjectionEvent } from "../../../../drizzle/tables/agent-studio-canvas.js";

import type { CanvasProjectionEventForwarder } from "./projection-events-drain.js";
import { projectAgsCanvasProjectionEventRow } from "./projection-events-drain-row-projector.js";
import type { CanvasProjectionEvent } from "./projection-events-sink.js";

export type CanvasProjectionEventDispatch = (
  event: CanvasProjectionEvent,
) => void | Promise<void>;

export interface CreateProjectingCanvasProjectionEventForwarderOptions {
  /** Required operator-supplied dispatcher — receives the projected
   *  in-memory event. The drain treats throws as failures (cursor
   *  stays at the last successful row). */
  readonly dispatch: CanvasProjectionEventDispatch;
}

export function createProjectingCanvasProjectionEventForwarder(
  options: CreateProjectingCanvasProjectionEventForwarderOptions,
): CanvasProjectionEventForwarder {
  const { dispatch } = options;
  return async (row: AgsCanvasProjectionEvent): Promise<void> => {
    const event = projectAgsCanvasProjectionEventRow(row);
    if (event == null) {
      console.warn(
        `[ags-canvas-projection-drain-forwarder] unprojectable row id=${row.id} kind=${row.kind} — advancing cursor (event dropped)`,
      );
      return;
    }
    await dispatch(event);
  };
}
