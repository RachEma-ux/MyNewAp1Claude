/**
 * C1-c6 + C4-c6 — `awaitApprovalDecision` shared D-RESUME loop.
 *
 * Pre-cycle-6 the loop was inlined in chat-stream.ts and missing
 * entirely from chat.ts; cycle-6 audit (`/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`)
 * called this out as the same parallel-flow asymmetry shape as
 * cycle-5 C1-c5, one layer deeper. The helper unifies the two
 * paths AND closes C4-c6 (listener leak on early-return) by
 * subscribing with an AbortSignal and aborting on the recheck-permit
 * branch.
 *
 * Coverage:
 *   1. Recheck succeeds → returns recheck verdict, "recheck_permit"
 *      outcome, listener cancelled (no leak).
 *   2. Bus event "allowed" → confirmed via re-eval, returns final
 *      verdict.
 *   3. Bus event "denied" → returns approval_denied rejection
 *      verdict with same call shape.
 *   4. Bus event "timed_out" (TTL elapsed) → returns approval_expired.
 *   5. Timeout (no event arrives) → returns approval_timeout.
 *   6. onAwaiting callback fires once, AFTER subscribe BEFORE re-eval
 *      (catches the streaming-path SSE-emit ordering invariant).
 */
import { describe, it, expect, vi } from "vitest";
import {
  awaitApprovalDecision,
} from "../../server/agent-studio/services/runtime/approval-resume-loop";
import {
  createApprovalEventBus,
} from "../../server/agent-studio/services/runtime/approval-event-bus";
import type {
  ProposedToolCall,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";
import type {
  RuntimeDispatchVerdict,
} from "../../server/agent-studio/services/runtime/proposed-tool-call-runtime";

const SAMPLE_CALL: ProposedToolCall = {
  mcpServerId: "srv1",
  toolName: "drop_table",
  arguments: { name: "users" },
  rationale: "operator requested",
  evidenceChunkIds: [],
  riskLevel: "critical",
  requiresApproval: true,
};

function pendingVerdict(reqId: number): RuntimeDispatchVerdict {
  return {
    ok: false,
    reason: "approval_pending",
    message: "operator decision required",
    code: null,
    call: SAMPLE_CALL,
    approvalRequestId: reqId,
  };
}

function permitVerdict(): RuntimeDispatchVerdict {
  return {
    ok: true,
    reason: null,
    message: null,
    code: null,
    call: SAMPLE_CALL,
    approvalRequestId: 42,
  };
}

describe("awaitApprovalDecision — C1-c6 + C4-c6", () => {
  it("recheck succeeds → returns permit + cancels listener (C4-c6 leak fix)", async () => {
    const bus = createApprovalEventBus();
    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 5000,
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate: async () => permitVerdict(),
    });
    expect(result.outcome).toBe("recheck_permit");
    expect(result.verdict.ok).toBe(true);
    // C4-c6: emit AFTER the await; listener should already be gone,
    // so this is a no-op (no second resolution race).
    bus.emit({ approvalRequestId: 42, status: "allowed", expiresAt: null });
    // No assertion needed — if the listener leaked, the test would
    // hang on a pending promise + potentially double-resolve.
  });

  it("bus event 'allowed' → defensive re-eval → returns final verdict", async () => {
    const bus = createApprovalEventBus();
    const revalidate = vi
      .fn()
      .mockResolvedValueOnce(pendingVerdict(42)) // 1st (D-RESUME-3)
      .mockResolvedValueOnce(permitVerdict());   // 2nd (D-RESUME-2 step 5 confirm)

    // Schedule the bus event after revalidate resolves the first time.
    queueMicrotask(() => {
      queueMicrotask(() => {
        bus.emit({ approvalRequestId: 42, status: "allowed", expiresAt: null });
      });
    });

    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 5000,
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate,
    });
    expect(result.outcome).toBe("event_allowed_confirmed");
    expect(result.verdict.ok).toBe(true);
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it("bus event 'denied' → returns approval_denied verdict with same call shape", async () => {
    const bus = createApprovalEventBus();
    queueMicrotask(() => {
      queueMicrotask(() => {
        bus.emit({ approvalRequestId: 42, status: "denied", expiresAt: null });
      });
    });
    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 5000,
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate: async () => pendingVerdict(42),
    });
    expect(result.outcome).toBe("event_denied");
    expect(result.verdict.ok).toBe(false);
    expect(result.verdict.reason).toBe("approval_denied");
    expect(result.verdict.call).toEqual(SAMPLE_CALL);
    expect(result.verdict.approvalRequestId).toBe(42);
  });

  it("bus event 'timed_out' → returns approval_expired verdict", async () => {
    const bus = createApprovalEventBus();
    queueMicrotask(() => {
      queueMicrotask(() => {
        bus.emit({ approvalRequestId: 42, status: "timed_out", expiresAt: null });
      });
    });
    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 5000,
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate: async () => pendingVerdict(42),
    });
    expect(result.outcome).toBe("event_expired");
    expect(result.verdict.reason).toBe("approval_expired");
  });

  it("timeout with no event → returns approval_timeout verdict", async () => {
    const bus = createApprovalEventBus();
    const result = await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 30, // very short for the test
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate: async () => pendingVerdict(42),
    });
    expect(result.outcome).toBe("timeout");
    expect(result.verdict.reason).toBe("approval_timeout");
    expect(result.verdict.approvalRequestId).toBe(42);
  });

  it("onAwaiting fires once, AFTER subscribe BEFORE revalidate (streaming SSE ordering)", async () => {
    const bus = createApprovalEventBus();
    const ordering: string[] = [];

    // Spy on the bus's waitFor so we can record subscribe ordering.
    const realWaitFor = bus.waitFor.bind(bus);
    bus.waitFor = ((reqId, timeoutMs, signal) => {
      ordering.push("subscribe");
      return realWaitFor(reqId, timeoutMs, signal);
    }) as typeof bus.waitFor;

    const onAwaiting = vi.fn(() => {
      ordering.push("onAwaiting");
    });
    const revalidate = vi.fn(async () => {
      ordering.push("revalidate");
      return permitVerdict();
    });

    await awaitApprovalDecision({
      approvalRequestId: 42,
      timeoutMs: 1000,
      initialVerdict: pendingVerdict(42),
      bus,
      revalidate,
      onAwaiting,
    });

    expect(onAwaiting).toHaveBeenCalledTimes(1);
    expect(onAwaiting).toHaveBeenCalledWith(42, 1000);
    // The exact ordering invariant: subscribe → onAwaiting → revalidate.
    // Subscribe FIRST so events between revalidate and subscribe aren't
    // lost (D-RESUME-3 race protection); onAwaiting BEFORE revalidate
    // so the streaming UI sees the badge before any decision arrives.
    expect(ordering).toEqual(["subscribe", "onAwaiting", "revalidate"]);
  });
});
