/**
 * Follow-up A2 — runtime approval-gate orchestration tests.
 *
 * Tests `gateRuntimeDispatch` — the pure orchestrator that composes
 * validator + approval gate into a single runtime verdict. DB calls
 * are injected via `evaluateGate` / `createRequest` so the orchestration
 * logic can be exercised without a live ASDB.
 *
 * The DB-backed `evaluateApprovalGate` / `createApprovalRequest` are
 * exercised in Phase 13 e2e (B2 follow-up).
 */

import { describe, it, expect, vi } from "vitest";
import {
  gateRuntimeDispatch,
  type RuntimeValidationResult,
} from "../../server/agent-studio/services/runtime/proposed-tool-call-runtime";
import type { ProposedToolCall } from "../../server/agent-studio/services/mcp/proposed-tool-call";

const SAMPLE_LOW: ProposedToolCall = {
  mcpServerId: "srv1",
  toolName: "search",
  arguments: { q: "x" },
  rationale: "",
  evidenceChunkIds: [],
  riskLevel: "low",
  requiresApproval: false,
};

const SAMPLE_HIGH: ProposedToolCall = {
  ...SAMPLE_LOW,
  toolName: "drop_table",
  riskLevel: "critical",
  requiresApproval: true,
};

function okValidation(call: ProposedToolCall): RuntimeValidationResult {
  return {
    ok: true,
    code: null,
    message: null,
    raw: { ok: true, normalized: call, liveSchemaHash: "h".repeat(64) },
    call,
  };
}

function rejectedValidation(
  code: "missing_parameter" | "schema_mismatch" = "missing_parameter",
): RuntimeValidationResult {
  return {
    ok: false,
    code,
    message: "validator says no",
    raw: { ok: false, code, message: "validator says no" },
    call: SAMPLE_HIGH,
  };
}

describe("gateRuntimeDispatch — branch coverage", () => {
  it("validator rejected → reason=validator_rejected, code preserved", async () => {
    const v = await gateRuntimeDispatch({
      validation: rejectedValidation("missing_parameter"),
      agentDraftId: 1,
      runtimeRunId: 1,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("validator_rejected");
      expect(v.code).toBe("missing_parameter");
      expect(v.message).toBe("validator says no");
      expect(v.approvalRequestId).toBeNull();
    }
  });

  it("validator ok + requiresApproval=false → ok=true; gate not invoked", async () => {
    const evaluateGate = vi.fn();
    const createRequest = vi.fn();
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_LOW),
      agentDraftId: 1,
      runtimeRunId: 1,
      evaluateGate,
      createRequest,
    });
    expect(v.ok).toBe(true);
    expect(evaluateGate).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("permit → ok=true, approvalRequestId carried through", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "permit",
      proposedToolCallHash: "h",
      approvalRequestId: 42,
      reason: "approval_active",
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 1,
      runtimeRunId: 1,
      evaluateGate,
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.approvalRequestId).toBe(42);
  });

  it("denied → reason=approval_denied with row id", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "denied",
      proposedToolCallHash: "h",
      approvalRequestId: 7,
      reason: "approval_denied",
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 1,
      runtimeRunId: 1,
      evaluateGate,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("approval_denied");
      expect(v.approvalRequestId).toBe(7);
      expect(v.code).toBeNull();
    }
  });

  it("expired → reason=approval_expired", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "expired",
      proposedToolCallHash: "h",
      approvalRequestId: 8,
      reason: "approval_expired",
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 1,
      runtimeRunId: 1,
      evaluateGate,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("approval_expired");
  });

  it("pending → reason=approval_pending", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "pending",
      proposedToolCallHash: "h",
      approvalRequestId: 9,
      reason: "approval_pending",
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 1,
      runtimeRunId: 1,
      evaluateGate,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("approval_pending");
  });

  it("approval_required → calls createRequest, returns reason=approval_required", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "approval_required",
      proposedToolCallHash: "h",
      approvalRequestId: null,
      reason: "approval_required",
    });
    const createRequest = vi.fn().mockResolvedValue({
      approvalRequestId: 100,
      created: true,
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 5,
      runtimeRunId: 50,
      description: "chat session 50",
      evaluateGate,
      createRequest,
    });
    expect(createRequest).toHaveBeenCalledWith({
      agentDraftId: 5,
      runtimeRunId: 50,
      proposedToolCall: SAMPLE_HIGH,
      description: "chat session 50",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("approval_required");
      expect(v.approvalRequestId).toBe(100);
      expect(v.message).toContain("newly created");
    }
  });

  it("approval_required + idempotent existing row → reason=approval_required, message indicates already-pending", async () => {
    const evaluateGate = vi.fn().mockResolvedValue({
      decision: "approval_required",
      proposedToolCallHash: "h",
      approvalRequestId: null,
      reason: "approval_required",
    });
    const createRequest = vi.fn().mockResolvedValue({
      approvalRequestId: 100,
      created: false, // already exists
    });
    const v = await gateRuntimeDispatch({
      validation: okValidation(SAMPLE_HIGH),
      agentDraftId: 5,
      runtimeRunId: 50,
      evaluateGate,
      createRequest,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("approval_required");
      expect(v.approvalRequestId).toBe(100);
      expect(v.message).toContain("already pending");
    }
  });
});
