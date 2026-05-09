/**
 * Retrofit P10 — Runtime trace writer (pure builders).
 *
 * The DB-backed `recordToolCallTrace` / `patchRacRuntimeTrace` are
 * exercised in Phase 13 e2e against a live ASDB. Here we lock the
 * pure assembly logic that determines what gets written.
 */

import { describe, it, expect } from "vitest";
import {
  approvalStatusForTrace,
  buildRacTracePatch,
  buildToolCallTraceRow,
  validationVerdictFromResult,
} from "../../server/agent-studio/services/runtime/trace-writer";
import type {
  ProposedToolCall,
  ProposedToolCallValidationResult,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";

const SAMPLE_CALL: ProposedToolCall = {
  mcpServerId: "srv1",
  toolName: "search_docs",
  arguments: { query: "x" },
  rationale: "user asked",
  evidenceChunkIds: [],
  riskLevel: "low",
  requiresApproval: false,
};

const SAMPLE_HIGH_CALL: ProposedToolCall = {
  ...SAMPLE_CALL,
  toolName: "run_python",
  riskLevel: "high",
  requiresApproval: true,
};

const okResult: ProposedToolCallValidationResult = {
  ok: true,
  normalized: SAMPLE_CALL,
  liveSchemaHash: "h".repeat(64),
};

const rejectedResult: ProposedToolCallValidationResult = {
  ok: false,
  code: "schema_mismatch",
  message: "schema differs",
};

describe("validationVerdictFromResult", () => {
  it("ok result → verdict=ok, code/message null", () => {
    const v = validationVerdictFromResult(okResult);
    expect(v).toEqual({ verdict: "ok", code: null, message: null });
  });

  it("rejected result → verdict=rejected, surfaces code + message", () => {
    const v = validationVerdictFromResult(rejectedResult);
    expect(v.verdict).toBe("rejected");
    expect(v.code).toBe("schema_mismatch");
    expect(v.message).toBe("schema differs");
  });
});

describe("approvalStatusForTrace", () => {
  it("null when approval not required (regardless of decision)", () => {
    expect(approvalStatusForTrace(false, "permit")).toBeNull();
    expect(approvalStatusForTrace(false, "denied")).toBeNull();
    expect(approvalStatusForTrace(false, null)).toBeNull();
  });

  it("null when no decision provided", () => {
    expect(approvalStatusForTrace(true, null)).toBeNull();
  });

  it("maps each gate decision onto trace status", () => {
    expect(approvalStatusForTrace(true, "permit")).toBe("allowed");
    expect(approvalStatusForTrace(true, "denied")).toBe("denied");
    expect(approvalStatusForTrace(true, "expired")).toBe("expired");
    expect(approvalStatusForTrace(true, "pending")).toBe("pending");
    expect(approvalStatusForTrace(true, "approval_required")).toBe("pending");
  });
});

describe("buildToolCallTraceRow", () => {
  it("happy path — validator ok, approval not required", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      runtimeTraceId: 5,
      runtimeRunId: 50,
      messageId: 500,
      proposedToolCall: SAMPLE_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: null,
      governanceVerdict: "allow",
      dispatchResult: "ok",
      dispatchAuditId: 9000,
      durationMs: 12,
    });
    expect(row.validationVerdict).toBe("ok");
    expect(row.approvalStatus).toBeNull();
    expect(row.governanceVerdict).toBe("allow");
    expect(row.dispatchResult).toBe("ok");
    expect(row.dispatchAuditId).toBe(9000);
    expect(row.proposedToolCallHash).toBe("abc");
    expect(row.runtimeTraceId).toBe(5);
  });

  it("rejected validator drops approval/dispatch fields", () => {
    // Caller passes them anyway — assembler is responsible for not
    // letting downstream consumers see misleading values when the
    // validator already short-circuited.
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: rejectedResult,
      approvalDecision: "permit",
      approvalRequestId: 77,
      governanceVerdict: "allow",
      dispatchResult: "ok",
      dispatchAuditId: 99,
    });
    expect(row.validationVerdict).toBe("rejected");
    expect(row.validationCode).toBe("schema_mismatch");
    expect(row.approvalStatus).toBeNull();
    expect(row.approvalRequestId).toBeNull();
    expect(row.governanceVerdict).toBeNull();
    expect(row.dispatchResult).toBeNull();
    expect(row.dispatchAuditId).toBeNull();
  });

  it("ok validator + high-risk call surfaces approval + dispatch metadata", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "permit",
      approvalRequestId: 77,
      governanceVerdict: "allow",
      dispatchResult: "ok",
    });
    expect(row.validationVerdict).toBe("ok");
    expect(row.approvalStatus).toBe("allowed");
    expect(row.approvalRequestId).toBe(77);
    expect(row.governanceVerdict).toBe("allow");
    expect(row.dispatchResult).toBe("ok");
  });

  it("ok validator + denied approval surfaces denial + suppresses dispatch (caller passes blocked)", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "denied",
      approvalRequestId: 77,
      governanceVerdict: null,
      dispatchResult: "blocked",
    });
    expect(row.approvalStatus).toBe("denied");
    expect(row.dispatchResult).toBe("blocked");
  });

  it("preserves error message for failed dispatch", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "permit",
      governanceVerdict: "allow",
      dispatchResult: "error",
      errorMessage: "timeout after 30s",
      durationMs: 30000,
    });
    expect(row.dispatchResult).toBe("error");
    expect(row.errorMessage).toBe("timeout after 30s");
    expect(row.durationMs).toBe(30000);
  });

  // ── H5-c6 — traceTimeoutReason invariant: only-set-when-expired ──
  // Pre-cycle-6 the trace row had no way to distinguish operator-wait
  // timeout from approval TTL elapsed; both collapsed to
  // approvalStatus="expired". H5-c6 adds traceTimeoutReason; the
  // builder enforces "only set when approvalStatus === 'expired'" so
  // the column's semantic stays clean.

  it("H5-c6: traceTimeoutReason flows through when approvalDecision='expired'", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "expired",
      approvalRequestId: 77,
      governanceVerdict: "allow",
      dispatchResult: "blocked",
      traceTimeoutReason: "operator_wait_timeout",
    });
    expect(row.approvalStatus).toBe("expired");
    expect(row.traceTimeoutReason).toBe("operator_wait_timeout");
  });

  it("H5-c6: traceTimeoutReason DROPPED when approvalDecision is not 'expired' (caller passes non-null)", () => {
    // The builder is responsible for not letting downstream consumers
    // see traceTimeoutReason on rows where it's semantically wrong.
    // Caller passes "operator_wait_timeout" but approvalDecision is
    // "permit" — builder must drop the timeout reason.
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "permit",
      approvalRequestId: 77,
      governanceVerdict: "allow",
      dispatchResult: "ok",
      traceTimeoutReason: "operator_wait_timeout", // contradiction
    });
    expect(row.approvalStatus).toBe("allowed");
    expect(row.traceTimeoutReason).toBeNull();
  });

  it("H5-c6: traceTimeoutReason DROPPED on validator rejection (chain short-circuited)", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: rejectedResult,
      approvalDecision: "expired",
      traceTimeoutReason: "operator_wait_timeout",
    });
    expect(row.approvalStatus).toBeNull();
    expect(row.traceTimeoutReason).toBeNull();
  });
});

describe("buildRacTracePatch", () => {
  it("normalizes a partial patch — missing fields default to null", () => {
    expect(buildRacTracePatch({})).toEqual({
      plannerMode: null,
      plannerReason: null,
      cagCompiledHash: null,
    });
  });

  it("preserves provided fields verbatim", () => {
    const p = buildRacTracePatch({
      plannerMode: "hybrid_cag_rag",
      plannerReason: "CAG pack + KB/RAG sources",
      cagCompiledHash: "f".repeat(64),
    });
    expect(p.plannerMode).toBe("hybrid_cag_rag");
    expect(p.plannerReason).toBe("CAG pack + KB/RAG sources");
    expect(p.cagCompiledHash).toMatch(/^f{64}$/);
  });
});
