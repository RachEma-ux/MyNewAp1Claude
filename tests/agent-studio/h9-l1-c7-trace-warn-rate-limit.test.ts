/**
 * H9-c7 + L1-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H9-c7 + §L1-c7) — trace-write warn rate-limit + approvalRequestId
 * context.
 *
 * Pre-cycle-7 the trace-write `console.warn` breadcrumb in
 * `persistRuntimeToolCallTrace` fired on EVERY failed write. A
 * prolonged ASDB outage during live chat (every tool call in every
 * turn fails) produced O(1000) warnings/min and could exhaust disk
 * on the operator console under default log-rotation pressure (H9).
 * The breadcrumb also omitted `approvalRequestId`, forcing forensics
 * to cross-reference against `agsRuntimePolicyEvents` and
 * `agsPendingPermissionRequests` to find the matching approval row
 * (L1).
 *
 * Post-cycle-7:
 *   - Warns are rate-limited to one per (workspaceId, agentId) tuple
 *     per 60s. Suppressed warns are silently dropped (no buffering).
 *   - The breadcrumb includes `approvalRequestId=...` (or `=null`
 *     when no approval gate fired).
 *
 * This file pins:
 *   1. Rate limit fires the FIRST warn for a key.
 *   2. Subsequent warns within 60s for the SAME key are suppressed.
 *   3. Different (workspace, agent) keys have INDEPENDENT budgets.
 *   4. Reset helper drops the budget (deterministic test surface).
 *   5. Warn message includes approvalRequestId=...
 *   6. Source carries the H9-c7 + L1-c7 closure markers.
 *   7. Doc-block defines the contract (catches a future PR that
 *      removes either the rate-limit or the approvalRequestId
 *      without updating the doc).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  persistRuntimeToolCallTrace,
  __resetTraceWarnRateLimitForTests,
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
    requiresApproval: false,
    approvalRequestId: null,
    call: SAMPLE_CALL,
    ...over,
  };
}

function okValidation(): RuntimeValidationResult {
  return {
    ok: true,
    rejectedAt: null,
    failures: [],
    failureSummary: null,
  };
}

const RUNTIME_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/proposed-tool-call-runtime.ts",
);

describe("H9-c7 — trace-write warn rate limit", () => {
  beforeEach(() => {
    __resetTraceWarnRateLimitForTests();
  });

  afterEach(() => {
    __resetTraceWarnRateLimitForTests();
    vi.useRealTimers();
  });

  it("fires the FIRST warn for a fresh (workspace, agent) key", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("suppresses subsequent warns within 60s for the SAME key", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Three calls in a row — only the first should warn.
      for (let i = 0; i < 3; i++) {
        await persistRuntimeToolCallTrace({
          workspaceId: 1,
          agentId: 2,
          agentDraftId: 3,
          runtimeRunId: 10,
          runtimeTraceId: null,
          messageId: null,
          verdict: okVerdict(),
          validation: okValidation(),
          dispatchResult: { ok: true, durationMs: 5 },
          recordTrace,
        });
      }
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // recordTrace was called 3 times — the gate is on the WARN,
      // not on the write attempt. Trace writes still fire (and still
      // fail) on every call.
      expect(recordTrace).toHaveBeenCalledTimes(3);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("different (workspace, agent) keys have INDEPENDENT budgets", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Same workspace, different agents — separate budgets.
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 999, // different agent
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      // Different workspace, same agent — also separate budget.
      await persistRuntimeToolCallTrace({
        workspaceId: 999, // different workspace
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(3);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("re-fires after 60s window elapses (Date.now stub)", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseT = 1_700_000_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(baseT);
    try {
      // First call — warn fires
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Same call, t+30s — suppressed (still inside 60s window)
      dateSpy.mockReturnValue(baseT + 30_000);
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Same call, t+60s — fires again (window elapsed)
      dateSpy.mockReturnValue(baseT + 60_000);
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  it("__resetTraceWarnRateLimitForTests drops the budget (deterministic test surface)", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Without reset the next call would be suppressed; with reset
      // the next call fires.
      __resetTraceWarnRateLimitForTests();
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("L1-c7 — approvalRequestId in trace-write warn breadcrumb", () => {
  beforeEach(() => {
    __resetTraceWarnRateLimitForTests();
  });

  afterEach(() => {
    __resetTraceWarnRateLimitForTests();
  });

  it("includes approvalRequestId=<id> when the verdict carries one", async () => {
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await persistRuntimeToolCallTrace({
        workspaceId: 7,
        agentId: 8,
        agentDraftId: 9,
        runtimeRunId: 50,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict({ approvalRequestId: 42 }),
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 10 },
        recordTrace,
      });
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("approvalRequestId=42");
      expect(msg).toContain("workspace=7");
      expect(msg).toContain("agent=8");
      expect(msg).toContain("draft=9");
      expect(msg).toContain("ASDB outage");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("includes approvalRequestId=null when the verdict has no approval gate", async () => {
    // The literal "null" sentinel makes a future grep
    // `approvalRequestId=null` work for "all the no-approval failures
    // since 9am" without ambiguity vs an unset field.
    const recordTrace = vi.fn().mockRejectedValue(new Error("ASDB outage"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await persistRuntimeToolCallTrace({
        workspaceId: 1,
        agentId: 2,
        agentDraftId: 3,
        runtimeRunId: 10,
        runtimeTraceId: null,
        messageId: null,
        verdict: okVerdict(), // approvalRequestId: null
        validation: okValidation(),
        dispatchResult: { ok: true, durationMs: 5 },
        recordTrace,
      });
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("approvalRequestId=null");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("H9-c7 + L1-c7 — source-scan lockstep", () => {
  const src = readFileSync(RUNTIME_PATH, "utf8");

  it("source carries the H9-c7 closure marker", () => {
    expect(
      src,
      "H9-c7 violated: proposed-tool-call-runtime.ts must carry the " +
        "H9-c7 closure marker so a future audit can trace the rate-" +
        "limit back to its origin item.",
    ).toMatch(/H9-c7\b/);
  });

  it("source carries the L1-c7 closure marker", () => {
    expect(
      src,
      "L1-c7 violated: proposed-tool-call-runtime.ts must carry the " +
        "L1-c7 closure marker so a future audit can trace the " +
        "approvalRequestId-in-warn change back to its origin item.",
    ).toMatch(/L1-c7\b/);
  });

  it("doc-block defines the rate-limit window (60s default)", () => {
    expect(
      src,
      "H9-c7 violated: proposed-tool-call-runtime.ts doc-block must " +
        "name the 60s rate-limit window so a future PR doesn't " +
        "reduce it without understanding the contract.",
    ).toMatch(/60s/);
  });

  it("doc-block defines the rate-limit key as (workspaceId, agentId)", () => {
    expect(
      src,
      "H9-c7 violated: doc-block must name the (workspaceId, agentId) " +
        "key so a future PR doesn't change the granularity to " +
        "per-workspace or per-agent without understanding why both " +
        "dimensions matter.",
    ).toMatch(/workspaceId[\s\S]{0,100}agentId/);
  });

  it("rate-limit constant is named TRACE_WARN_MIN_INTERVAL_MS = 60_000", () => {
    expect(
      src,
      "H9-c7 violated: the rate-limit constant must be named " +
        "TRACE_WARN_MIN_INTERVAL_MS = 60_000 so it's greppable + " +
        "reviewers can see the value without reading the doc-block.",
    ).toMatch(/TRACE_WARN_MIN_INTERVAL_MS\s*=\s*60_000/);
  });

  it("rate-limit map is named lastTraceWarnAt", () => {
    expect(
      src,
      "H9-c7 violated: the rate-limit map must be named " +
        "lastTraceWarnAt so its purpose is obvious from the symbol " +
        "alone (matches the standing pattern for time-bucketed maps).",
    ).toMatch(/lastTraceWarnAt\s*=\s*new Map/);
  });

  it("warn message includes approvalRequestId=...", () => {
    // The load-bearing assertion. A future PR that "tidied" the warn
    // template by dropping the approval context would silently
    // re-introduce the L1-c7 forensics gap.
    expect(
      src,
      "L1-c7 violated: warn message template must include " +
        "approvalRequestId=${...} so operator forensics don't need to " +
        "cross-reference against agsPendingPermissionRequests for the " +
        "matching approval row.",
    ).toMatch(/approvalRequestId=\$\{input\.verdict\.approvalRequestId/);
  });

  it("__resetTraceWarnRateLimitForTests is exported", () => {
    expect(
      src,
      "H9-c7 violated: the rate-limit reset helper must be exported " +
        "as __resetTraceWarnRateLimitForTests so deterministic tests " +
        "can drop the budget without resorting to module-level state " +
        "introspection.",
    ).toMatch(/export function __resetTraceWarnRateLimitForTests/);
  });
});
