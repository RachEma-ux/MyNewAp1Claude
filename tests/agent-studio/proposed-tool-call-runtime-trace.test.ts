/**
 * Follow-up A3 — runtime trace persistence orchestration tests.
 *
 * Tests `persistRuntimeToolCallTrace` and `approvalDecisionFromVerdict`.
 * The DB-backed `recordToolCallTrace` is injected as a fake so the
 * orchestration logic is exercised without a live ASDB.
 *
 * The DB-backed call itself is exercised in Phase 13 e2e (B3 follow-up).
 */

import { describe, it, expect, vi } from "vitest";
import {
  approvalDecisionFromVerdict,
  persistRuntimeToolCallTrace,
  type RuntimeDispatchVerdict,
  type RuntimeValidationResult,
} from "../../server/agent-studio/services/runtime/proposed-tool-call-runtime";
import type { ProposedToolCall } from "../../server/agent-studio/services/mcp/proposed-tool-call";

const SAMPLE_CALL: ProposedToolCall = {
  mcpServerId: "srv1",
  toolName: "search",
  arguments: { q: "x" },
  rationale: "",
  evidenceChunkIds: [],
  riskLevel: "low",
  requiresApproval: false,
};

function okVerdict(over: Partial<RuntimeDispatchVerdict> = {}): RuntimeDispatchVerdict {
  return {
    ok: true,
    reason: null,
    message: null,
    code: null,
    call: SAMPLE_CALL,
    approvalRequestId: null,
    ...over,
  };
}

function rejectedVerdict(
  reason: RuntimeDispatchVerdict["reason"],
  approvalRequestId: number | null = null,
): RuntimeDispatchVerdict {
  return {
    ok: false,
    reason,
    message: "x",
    code: null,
    call: SAMPLE_CALL,
    approvalRequestId,
  };
}

function okValidation(): RuntimeValidationResult {
  return {
    ok: true,
    code: null,
    message: null,
    raw: { ok: true, normalized: SAMPLE_CALL, liveSchemaHash: "h".repeat(64) },
    call: SAMPLE_CALL,
  };
}

describe("approvalDecisionFromVerdict", () => {
  it("ok + no approval row → null (no-approval-required case)", () => {
    expect(approvalDecisionFromVerdict(okVerdict())).toBeNull();
  });

  it("ok + approval row → permit", () => {
    expect(approvalDecisionFromVerdict(okVerdict({ approvalRequestId: 9 }))).toBe(
      "permit",
    );
  });

  it("validator_rejected → null (approval not relevant)", () => {
    expect(approvalDecisionFromVerdict(rejectedVerdict("validator_rejected"))).toBeNull();
  });

  it("approval_denied → denied", () => {
    expect(approvalDecisionFromVerdict(rejectedVerdict("approval_denied", 1))).toBe(
      "denied",
    );
  });

  it("approval_expired → expired", () => {
    expect(approvalDecisionFromVerdict(rejectedVerdict("approval_expired", 1))).toBe(
      "expired",
    );
  });

  it("approval_pending → pending", () => {
    expect(approvalDecisionFromVerdict(rejectedVerdict("approval_pending", 1))).toBe(
      "pending",
    );
  });

  it("approval_required → approval_required", () => {
    expect(approvalDecisionFromVerdict(rejectedVerdict("approval_required", 1))).toBe(
      "approval_required",
    );
  });
});

describe("persistRuntimeToolCallTrace", () => {
  it("dispatch ok → dispatchResult='ok', error null", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 100 });
    const r = await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: 5,
      messageId: 9,
      verdict: okVerdict(),
      validation: okValidation(),
      dispatchResult: { ok: true, durationMs: 12 },
      recordTrace,
    });
    expect(r.id).toBe(100);
    expect(recordTrace).toHaveBeenCalledTimes(1);
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.dispatchResult).toBe("ok");
    expect(arg.errorMessage).toBeNull();
    expect(arg.durationMs).toBe(12);
  });

  it("dispatch error → dispatchResult='error', error surfaces", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 101 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: 5,
      messageId: 9,
      verdict: okVerdict(),
      validation: okValidation(),
      dispatchResult: {
        ok: false,
        error: { message: "timeout" },
        durationMs: 30000,
      },
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.dispatchResult).toBe("error");
    expect(arg.errorMessage).toBe("timeout");
    expect(arg.durationMs).toBe(30000);
  });

  it("rejected (validator) + no dispatch → dispatchResult='blocked'", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 102 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: rejectedVerdict("validator_rejected"),
      validation: okValidation(),
      dispatchResult: null,
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.dispatchResult).toBe("blocked");
    expect(arg.approvalDecision).toBeNull();
  });

  it("rejected (approval_denied) → approvalDecision='denied', approvalRequestId carried", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 103 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: rejectedVerdict("approval_denied", 77),
      validation: okValidation(),
      dispatchResult: null,
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.dispatchResult).toBe("blocked");
    expect(arg.approvalDecision).toBe("denied");
    expect(arg.approvalRequestId).toBe(77);
  });

  it("ok dispatch + permit (with approval row) → approvalDecision='permit'", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 104 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: okVerdict({ approvalRequestId: 5 }),
      validation: okValidation(),
      dispatchResult: { ok: true, durationMs: 100 },
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.approvalDecision).toBe("permit");
    expect(arg.approvalRequestId).toBe(5);
    expect(arg.dispatchResult).toBe("ok");
  });

  it("recordTrace failure is swallowed — returns id=null", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB unavailable"));
    const r = await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: okVerdict(),
      validation: okValidation(),
      dispatchResult: { ok: true, durationMs: 10 },
      recordTrace,
    });
    expect(r.id).toBeNull();
  });

  it("recordTrace failure surfaces a console.warn breadcrumb (PR #220)", async () => {
    // Polish PR #220 upgraded the silent `.catch(() => {})` to
    // `console.warn` so persistent ASDB outages leave a breadcrumb
    // operators can grep. This test guards against a future refactor
    // accidentally re-silencing the path.
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB unavailable"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await persistRuntimeToolCallTrace({
        workspaceId: 7,
        agentId: 8,
        agentDraftId: 9,
        runtimeRunId: 50,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 10 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("[ags-runtime] tool-call trace write failed");
      expect(msg).toContain("workspace=7");
      expect(msg).toContain("agent=8");
      expect(msg).toContain("draft=9");
      expect(msg).toContain("ASDB unavailable");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("computes proposedToolCallHash from the verdict's call", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 105 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: okVerdict(),
      validation: okValidation(),
      dispatchResult: { ok: true, durationMs: 1 },
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.proposedToolCallHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── H5-c6 — traceTimeoutReason distinguishes "expired" outcomes ─

  it("H5-c6: approval_timeout verdict → traceTimeoutReason='operator_wait_timeout'", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 110 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: rejectedVerdict("approval_timeout", 88),
      validation: okValidation(),
      dispatchResult: null,
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    // Both reasons collapse to approvalDecision='expired' but the
    // trace row preserves the distinct cause via traceTimeoutReason.
    expect(arg.approvalDecision).toBe("expired");
    expect(arg.traceTimeoutReason).toBe("operator_wait_timeout");
  });

  it("H5-c6: approval_expired verdict → traceTimeoutReason='approval_ttl_elapsed'", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 111 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: rejectedVerdict("approval_expired", 88),
      validation: okValidation(),
      dispatchResult: null,
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.approvalDecision).toBe("expired");
    expect(arg.traceTimeoutReason).toBe("approval_ttl_elapsed");
  });

  it("H5-c6: non-timeout verdicts pass null for traceTimeoutReason", async () => {
    const recordTrace = vi.fn().mockResolvedValue({ id: 112 });
    await persistRuntimeToolCallTrace({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      runtimeRunId: 50,
      runtimeTraceId: null,
      messageId: null,
      verdict: rejectedVerdict("approval_denied", 88),
      validation: okValidation(),
      dispatchResult: null,
      recordTrace,
    });
    const arg = recordTrace.mock.calls[0][0];
    expect(arg.traceTimeoutReason).toBeNull();
  });
});
