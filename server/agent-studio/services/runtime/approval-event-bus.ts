/**
 * Approval Event Bus — C2-c4 PR-2 (D-RESUME-1).
 *
 * Locks D-RESUME-1, D-RESUME-3, D-RESUME-4 from
 * `docs/architecture/agent-studio-approval-resume-path.md`.
 *
 * In-process EventEmitter wrapper keyed by `approvalRequestId`.
 * `decideApprovalRequest()` (server/agent-studio/services/approval/
 * approval-gate.ts) emits an `ApprovalDecidedEvent` after the
 * `agsRuntimePolicyEvents` audit row write. `chat-stream.ts` (C2-c4
 * PR-3) subscribes via `waitFor()` when the gate returns
 * `approval_required`/`approval_pending`, with a bounded timeout.
 *
 * Per D-RESUME-3, events are NOT buffered: if `emit()` fires before
 * any subscriber exists, the event is dropped. The DB-poll fallback
 * (a single re-eval of the gate after subscribe, before waiting)
 * handles the approve-before-subscribe race in the caller.
 *
 * Per D-RESUME-4, the bus is per-process. If `decideApprovalRequest()`
 * runs on process P2 while a chat-stream waits on process P1, the
 * P1 wait times out — the user re-prompts to pick up the now-allowed
 * row. Single-process is the MVP ops baseline; D-RESUME-5 documents
 * the LISTEN/NOTIFY upgrade path with the same bus interface.
 */
import { EventEmitter } from "events";

export interface ApprovalDecidedEvent {
  approvalRequestId: number;
  status: "allowed" | "denied" | "timed_out";
  expiresAt: Date | null;
}

/**
 * C4-c6 (cycle-6 audit closure §C4-c6): `"cancelled"` outcome
 * surfaces when the caller aborted via the optional AbortSignal.
 * Pre-cycle-6 the only outcomes were `event` and `"timeout"` —
 * callers had no way to release a listener early when an
 * out-of-band path (e.g., D-RESUME-3 DB-poll fallback succeeding)
 * made the wait unnecessary. Bounded leak (300s default timeout)
 * but accumulated under load.
 */
export type WaitForResult = ApprovalDecidedEvent | "timeout" | "cancelled";

export interface ApprovalEventBus {
  /**
   * Fire an event to all current subscribers for `event.approvalRequestId`.
   * No-op if no subscribers exist (events are not buffered — D-RESUME-3).
   */
  emit(event: ApprovalDecidedEvent): void;

  /**
   * Subscribe to the next event for `approvalRequestId` with a bounded
   * timeout. Returns the event when one arrives, the literal
   * `"timeout"` if `timeoutMs` elapses first, or the literal
   * `"cancelled"` if the optional `signal` is aborted first. Multiple
   * subscribers on the same `approvalRequestId` all receive the event
   * when it fires (per D-RESUME-2 step 4: race between bus event and
   * timeout).
   *
   * Cleans up its listener on every resolve path (event / timeout /
   * abort) — no listener leak even if the caller drops the promise.
   * The C4-c6 closure path is: caller passes a signal, calls abort
   * when D-RESUME-3 re-eval succeeds, listener releases synchronously.
   */
  waitFor(
    approvalRequestId: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<WaitForResult>;
}

/**
 * Late-bound hook fired on every `emit()`. D-RESUME-5 (PR-V1-165)
 * wires this to `notifyApprovalDecided` for cross-process fan-out
 * via Postgres LISTEN/NOTIFY. Default null = single-process
 * baseline (D-RESUME-4); no NOTIFY traffic.
 */
let _onEmit: ((event: ApprovalDecidedEvent) => void) | null = null;

export function setApprovalEventEmitHook(
  hook: ((event: ApprovalDecidedEvent) => void) | null,
): void {
  _onEmit = hook;
}

function fireEmitHook(event: ApprovalDecidedEvent): void {
  if (_onEmit) {
    try {
      _onEmit(event);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-approval-event-bus] emit hook threw — ${msg}`);
    }
  }
}

/**
 * Factory function for testability (D-RESUME-7).
 * Each call returns an isolated bus — useful so unit tests don't
 * cross-pollute via the singleton.
 */
export function createApprovalEventBus(): ApprovalEventBus {
  const emitter = new EventEmitter();
  // Default 10 listeners is too few for realistic concurrency
  // (multiple chat-streams could legitimately wait on different
  // approvalRequestIds; same-key concurrency is rarer but allowed).
  emitter.setMaxListeners(100);

  const eventName = (id: number): string => `approval_decided:${id}`;

  return {
    emit(event: ApprovalDecidedEvent): void {
      emitter.emit(eventName(event.approvalRequestId), event);
      fireEmitHook(event);
    },

    waitFor(
      approvalRequestId: number,
      timeoutMs: number,
      signal?: AbortSignal,
    ): Promise<WaitForResult> {
      return new Promise<WaitForResult>((resolve) => {
        const evt = eventName(approvalRequestId);
        // Pre-aborted signals must resolve immediately without
        // attaching the listener (avoids the no-op listener path).
        if (signal?.aborted) {
          resolve("cancelled");
          return;
        }
        const cleanup = () => {
          clearTimeout(timer);
          emitter.off(evt, onEvent);
          if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve("timeout");
        }, timeoutMs);
        const onEvent = (event: ApprovalDecidedEvent) => {
          cleanup();
          resolve(event);
        };
        const abortHandler = signal
          ? () => {
              cleanup();
              resolve("cancelled");
            }
          : null;
        if (signal && abortHandler) signal.addEventListener("abort", abortHandler);
        emitter.once(evt, onEvent);
      });
    },
  };
}

// ── Production singleton ──────────────────────────────────────────────
let _singleton: ApprovalEventBus | null = null;

export function getApprovalEventBus(): ApprovalEventBus {
  if (!_singleton) _singleton = createApprovalEventBus();
  return _singleton;
}

/**
 * Test helper — drop the cached singleton so subsequent
 * `getApprovalEventBus()` calls return a fresh instance. Avoids
 * cross-test bleed-through when tests exercise the singleton
 * (vs. constructing their own via `createApprovalEventBus()`).
 */
export function _resetApprovalEventBusForTests(): void {
  _singleton = null;
}
