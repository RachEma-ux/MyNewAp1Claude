/**
 * Canvas → graph projection events sink — V1+ 17-γ-canvas-events (PR-V1-41).
 *
 * Caller→worker glue for the existing `ProjectionSyncWorker` event
 * taxonomy (`canvas.note_reference_changed` /
 * `canvas.note_reference_removed`). See
 * `docs/architecture/agent-studio-canvas-projection-events.md` for
 * the architectural decision.
 *
 * Pattern mirrors AS-2's default-governance-gate registry (#782):
 * module-singleton sink + `register` / `get` / `has` / `__reset`
 * plus a convenience `recordCanvasProjectionEvent` entry point.
 *
 * Default sink is a no-op. Installing this code does NOT change
 * existing canvas-service behavior on first install. Operators
 * register a real sink (in-memory for tests, DB-backed for
 * production) in a separate follow-up PR.
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Sink runs synchronously (Promise allowed) inside the caller's
 *     transaction context. Sinks that need to defer should resolve
 *     fast — no awaiting on long DB writes here.
 */

/**
 * Canvas projection event shape. Subset of `ProjectionEvent` from
 * `services/graph/projection/sync-worker.ts` scoped to the two
 * canvas-originating kinds.
 *
 * Declared structurally rather than imported so this module can
 * stay isolated from the graph/projection package — the sync-worker
 * file imports `GraphRepository` transitively and would pull
 * forbidden surfaces into the canvas-service hard-rule scan.
 */
export type CanvasProjectionEvent =
  | {
      readonly kind: "canvas.note_reference_changed";
      readonly payload: {
        readonly canvasId: number;
        readonly canvasNodeId: number;
        readonly referencedNoteId: number;
      };
    }
  | {
      readonly kind: "canvas.note_reference_removed";
      readonly payload: { readonly canvasNodeId: number };
    };

export type CanvasProjectionEventSink = (
  event: CanvasProjectionEvent,
) => void | Promise<void>;

let _sink: CanvasProjectionEventSink | null = null;

export function registerCanvasProjectionEventSink(
  sink: CanvasProjectionEventSink,
): void {
  _sink = sink;
}

export function getCanvasProjectionEventSink(): CanvasProjectionEventSink | null {
  return _sink;
}

export function hasCanvasProjectionEventSink(): boolean {
  return _sink != null;
}

export function __resetCanvasProjectionEventSinkForTests(): void {
  _sink = null;
}

/**
 * Convenience entry-point for canvas-service callers. When a sink is
 * registered, forwards the event. When no sink is registered, no-op
 * (default state — preserves existing behavior).
 *
 * Errors from the sink are caught + logged via `console.warn` so a
 * faulty sink never breaks the canvas-service mutation path. The
 * event is dropped on sink failure; operator tooling should surface
 * the warn-log for triage.
 */
export async function recordCanvasProjectionEvent(
  event: CanvasProjectionEvent,
): Promise<void> {
  const sink = _sink;
  if (!sink) return;
  try {
    await sink(event);
  } catch (err) {
    console.warn(
      "[ags-canvas-projection] sink error — event dropped:",
      err instanceof Error ? err.message : err,
    );
  }
}
