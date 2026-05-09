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

export type WaitForResult = ApprovalDecidedEvent | "timeout";

export interface ApprovalEventBus {
  /**
   * Fire an event to all current subscribers for `event.approvalRequestId`.
   * No-op if no subscribers exist (events are not buffered — D-RESUME-3).
   */
  emit(event: ApprovalDecidedEvent): void;

  /**
   * Subscribe to the next event for `approvalRequestId` with a bounded
   * timeout. Returns the event when one arrives, or the literal
   * `"timeout"` if `timeoutMs` elapses first. Multiple subscribers
   * on the same `approvalRequestId` all receive the event when it
   * fires (per D-RESUME-2 step 4: race between bus event and timeout).
   *
   * Cleans up its listener on both resolve paths — no listener leak
   * even if the caller drops the promise.
   */
  waitFor(
    approvalRequestId: number,
    timeoutMs: number,
  ): Promise<WaitForResult>;
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
    },

    waitFor(
      approvalRequestId: number,
      timeoutMs: number,
    ): Promise<WaitForResult> {
      return new Promise<WaitForResult>((resolve) => {
        const evt = eventName(approvalRequestId);
        const timer = setTimeout(() => {
          emitter.off(evt, onEvent);
          resolve("timeout");
        }, timeoutMs);
        const onEvent = (event: ApprovalDecidedEvent) => {
          clearTimeout(timer);
          emitter.off(evt, onEvent);
          resolve(event);
        };
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
