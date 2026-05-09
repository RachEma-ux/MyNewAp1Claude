/**
 * Approval-resume loop — C1-c6 + C4-c6 + H3-c6 + M4-c6 closure.
 *
 * Cycle-6 audit (`/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`)
 * found 4 related defects on the resume path:
 *
 *   - **C1-c6**: `services/chat.ts` had NO D-RESUME loop at all. When
 *     the gate returned `approval_required`/`approval_pending`,
 *     chat.ts wrote a rejection to history and `continue`d — the
 *     chat session never resumed when the operator approved
 *     out-of-band. chat-stream.ts had the loop inline.
 *
 *   - **C4-c6**: chat-stream.ts's D-RESUME-3 early-return path (when
 *     the DB-poll re-eval succeeded) created the bus subscription
 *     via `waitFor()` and then never awaited it. The listener stayed
 *     pending until the 300s timeout. Bounded leak but accumulated
 *     under load (~3000 dangling waiters at 10 chats/min).
 *
 *   - **H3-c6**: chat.ts had no signal to its (blocking) caller that
 *     an approval was pending. The blocking RPC silently returned a
 *     denial response. Resolved by virtue of C1: chat.ts now waits.
 *
 *   - **M4-c6**: dispatcher's `caller` field was never threaded by
 *     either chat path. (Closed at the call sites, not here — this
 *     module owns the resume loop only.)
 *
 * Cycle-6 closure: extract the loop into ONE shared helper. Both
 * call sites delegate. The helper subscribes BEFORE re-eval per
 * D-RESUME-3 race protection, races bus event vs timeout, and on early-return
 * (recheck succeeds) ABORTS the subscription via the new C4-c6
 * AbortSignal API on the bus's `waitFor()`. The listener releases
 * synchronously instead of leaking for the timeout window.
 *
 * Contract:
 *
 *   - `revalidate()` is the caller's gate function (e.g.,
 *     `gateRuntimeDispatch({...})`); the helper calls it once after
 *     subscribing and once more on the "allowed" event for D-RESUME-2
 *     step 5 defensive confirmation.
 *
 *   - `initialVerdict` carries the call shape the helper preserves
 *     when constructing rejection verdicts (timeout / denied /
 *     expired). Required because the helper must return the same
 *     `call` field shape that the original verdict carried.
 *
 *   - `onAwaiting` is an optional callback fired AFTER subscribe but
 *     BEFORE re-eval — the streaming caller (chat-stream) uses it to
 *     emit the `awaiting_approval` SSE event. The non-streaming
 *     caller (chat.ts) passes a no-op.
 *
 *   - The helper always resolves; never throws. The bus
 *     cancel-on-early-return path is opaque to the caller.
 */
import type {
  ProposedToolCall,
  ProposedToolCallValidationCode,
} from "../mcp/proposed-tool-call";
import type { ApprovalEventBus } from "./approval-event-bus";
import { getApprovalEventBus } from "./approval-event-bus";
import type {
  RuntimeDispatchRejection,
  RuntimeDispatchVerdict,
} from "./proposed-tool-call-runtime";

export interface AwaitApprovalDecisionInput {
  /** Approval row id to wait on (must be set; verdicts without it
   *  must not enter this helper — the caller short-circuits earlier). */
  approvalRequestId: number;
  /** Bounded wait window in milliseconds. */
  timeoutMs: number;
  /**
   * Re-evaluation function. Called twice: once after subscribe (D-RESUME-3
   * fallback) and once on the "allowed" event (D-RESUME-2 step 5). Both
   * calls must return the latest verdict against live DB state.
   */
  revalidate(): Promise<RuntimeDispatchVerdict>;
  /**
   * The verdict that triggered the wait — preserves the `call` shape +
   * approvalRequestId that helper uses to construct rejection
   * verdicts (approval_timeout / approval_denied / approval_expired).
   */
  initialVerdict: RuntimeDispatchVerdict;
  /**
   * Optional hook fired AFTER subscribe + BEFORE re-eval. The streaming
   * caller emits an `awaiting_approval` SSE event here. Non-streaming
   * callers pass a no-op.
   */
  onAwaiting?(reqId: number, timeoutMs: number): void;
  /** Bus injection point for tests. Production uses the singleton. */
  bus?: ApprovalEventBus;
}

export interface AwaitApprovalDecisionResult {
  verdict: RuntimeDispatchVerdict;
  /**
   * Diagnostic label for what resolved the wait. Useful for
   * trace metadata and tests; callers don't need to branch on it.
   */
  outcome:
    | "recheck_permit"
    | "event_allowed_confirmed"
    | "event_denied"
    | "event_expired"
    | "timeout";
}

/**
 * Wait for an approval decision (or timeout) and return the resulting
 * verdict. Subscribes BEFORE re-eval per D-RESUME-3 race protection,
 * and cancels the subscription on early-return (C4-c6 leak fix).
 */
export async function awaitApprovalDecision(
  input: AwaitApprovalDecisionInput,
): Promise<AwaitApprovalDecisionResult> {
  const bus = input.bus ?? getApprovalEventBus();
  const reqId = input.approvalRequestId;
  const timeoutMs = input.timeoutMs;

  // C4-c6: AbortController so the early-return path can release the
  // bus listener synchronously instead of leaking until timeout.
  const ac = new AbortController();
  // Subscribe BEFORE re-eval per D-RESUME-3 race window protection.
  const waitPromise = bus.waitFor(reqId, timeoutMs, ac.signal);

  // C1-c6: streaming caller hooks here to emit the awaiting_approval
  // SSE event. Non-streaming caller passes a no-op.
  input.onAwaiting?.(reqId, timeoutMs);

  // D-RESUME-3: re-eval the gate once. Approve-before-subscribe race
  // is caught here.
  const recheck = await input.revalidate();
  if (recheck.ok) {
    // C4-c6: cancel the listener synchronously. The waitPromise will
    // resolve to "cancelled"; we await it so cleanup completes
    // before the function returns.
    ac.abort();
    await waitPromise;
    return { verdict: recheck, outcome: "recheck_permit" };
  }

  // Wait for bus event or timeout (no early return → no leak).
  const event = await waitPromise;

  if (event === "timeout") {
    return {
      verdict: rejectionVerdict(
        input.initialVerdict.call,
        reqId,
        "approval_timeout",
        `approval did not resolve within ${Math.floor(timeoutMs / 1000)}s`,
      ),
      outcome: "timeout",
    };
  }

  if (event === "cancelled") {
    // Defensive: event === "cancelled" should not occur on this code
    // path (we only abort BEFORE awaiting). Treat as timeout-shaped
    // verdict so the caller doesn't crash on an unhandled outcome.
    return {
      verdict: rejectionVerdict(
        input.initialVerdict.call,
        reqId,
        "approval_timeout",
        `approval wait cancelled unexpectedly`,
      ),
      outcome: "timeout",
    };
  }

  if (event.status === "allowed") {
    // D-RESUME-2 step 5: defensive re-eval to confirm DB matches the
    // bus event (handles rare race where row was decided then
    // re-decided between events).
    const final = await input.revalidate();
    return { verdict: final, outcome: "event_allowed_confirmed" };
  }

  // event.status is "denied" or "timed_out"
  const reason: RuntimeDispatchRejection =
    event.status === "denied" ? "approval_denied" : "approval_expired";
  return {
    verdict: rejectionVerdict(
      input.initialVerdict.call,
      reqId,
      reason,
      `approval ${event.status}`,
    ),
    outcome: event.status === "denied" ? "event_denied" : "event_expired",
  };
}

function rejectionVerdict(
  call: ProposedToolCall,
  approvalRequestId: number,
  reason: RuntimeDispatchRejection,
  message: string,
): RuntimeDispatchVerdict {
  return {
    ok: false,
    reason,
    message,
    code: null as ProposedToolCallValidationCode | null,
    call,
    approvalRequestId,
  };
}
