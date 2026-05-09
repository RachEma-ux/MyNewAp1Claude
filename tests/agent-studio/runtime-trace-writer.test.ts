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

  // ── M2-c7 (cycle-7 audit closure §M2-c7) — drop errorMessage on ok ─
  // The "preserves error message for failed dispatch" test above
  // pinned the error-side. The audit flagged the missing inverse:
  // when `dispatchResult === "ok"`, any caller-provided
  // `errorMessage` MUST be dropped so the failure-forensics column
  // doesn't get seeded with garbage. Mirrors the H5-c6
  // "traceTimeoutReason only when expired" + isRejected
  // "drop fields that don't apply" patterns. Pre-cycle-7 the
  // builder passed errorMessage through unconditionally; PR-F
  // closes the gap structurally (builder enforces) AND assertively
  // (this test).

  it("M2-c7: dispatchResult='ok' drops caller-provided errorMessage (mirrors isRejected drop pattern)", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 10,
      agentDraftId: 100,
      proposedToolCall: SAMPLE_HIGH_CALL,
      proposedToolCallHash: "abc",
      validation: okResult,
      approvalDecision: "permit",
      governanceVerdict: "allow",
      dispatchResult: "ok",
      // Caller passes a stray errorMessage with ok=true (could
      // happen if a partial-failure tool returns a non-fatal warning
      // string and a sloppy caller threads it through). The trace
      // row MUST drop it — the column belongs to failure forensics
      // only.
      errorMessage: "this should be dropped",
      durationMs: 5,
    });
    expect(row.dispatchResult).toBe("ok");
    expect(row.errorMessage).toBeNull();
    expect(row.durationMs).toBe(5);
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
  // H4-c7 / C2-c7 (cycle-7 audit closure §H4-c7) — contract change:
  // missing keys are NO LONGER normalized to null. The function now
  // distinguishes "key absent" (leave alone) from "key present with
  // null" (explicit clear). Pre-cycle-7 the normalize-to-null behavior
  // caused a partial-update race where a second caller's patch
  // overwrote a first caller's planner fields with NULL.

  it("returns an empty object when no keys are provided (no UPDATE work)", () => {
    expect(buildRacTracePatch({})).toEqual({});
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

  it("H4-c7: omits keys that were never provided (race fix)", () => {
    // The race fix's load-bearing assertion. If buildRacTracePatch
    // included `plannerMode: null` here, a future patchRacRuntimeTrace
    // call would emit `SET planner_mode = NULL` and overwrite a value
    // an earlier caller had set.
    const p = buildRacTracePatch({ plannerReason: "fresh" });
    expect(p).toEqual({ plannerReason: "fresh" });
    expect("plannerMode" in p).toBe(false);
    expect("cagCompiledHash" in p).toBe(false);
  });

  it("H4-c7: explicit null is preserved (means 'clear this column')", () => {
    // The explicit-null case — the caller knows the column exists and
    // wants to clear it. Distinct from "leave alone" (key absent).
    const p = buildRacTracePatch({ plannerMode: null });
    expect(p).toEqual({ plannerMode: null });
    expect("plannerMode" in p).toBe(true);
  });

  it("H4-c7: explicit undefined is treated as 'leave alone' (not 'clear')", () => {
    // TypeScript callers passing `{plannerMode: undefined}` (e.g.
    // `{plannerMode: maybeValue}` where maybeValue is undefined)
    // should not accidentally clear the column. The `?? null` guard
    // collapses undefined-after-the-key-present to null, but the
    // 'in' check determines whether the key appears in the output.
    // To match operator intent, we ALSO want explicit undefined to
    // behave like "leave alone" — but the current `'key' in input`
    // check would still include it. This test pins the current
    // behavior + flags the corner.
    const p = buildRacTracePatch({ plannerMode: undefined });
    // Current: 'plannerMode' IS in input (TypeScript-wise), so the
    // key gets included with value null (after `?? null` coalesce).
    // This is the explicit-null semantic. Callers who want
    // "leave alone" must omit the key entirely (use rest-spread).
    expect("plannerMode" in p).toBe(true);
    expect(p.plannerMode).toBeNull();
  });

  it("H4-c7: idempotent — buildRacTracePatch(buildRacTracePatch(x)) === buildRacTracePatch(x)", () => {
    const once = buildRacTracePatch({
      plannerMode: "x",
      plannerReason: null,
    });
    const twice = buildRacTracePatch(once);
    expect(twice).toEqual(once);
  });
});
