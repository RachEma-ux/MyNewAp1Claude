/**
 * Phase 19a — MCP Dispatcher tests.
 *
 * 12 cases covering the contract surface:
 *  1.  Happy path → ok:true + audit row + governance verdict
 *  2.  Invalid tool name → invalid_tool_name
 *  3.  Server not found → server_not_found
 *  4.  Server not connected → server_not_connected
 *  5.  Tool not on server → tool_not_found
 *  6.  allowedTools rejects → not_authorized + audit row
 *  7.  Governance pre-invoke denies → governance_blocked + tool NOT invoked
 *  8.  conn.callTool throws → tool_execution_failed
 *  9.  Slow call → post-invoke "warn" verdict
 * 10.  Source attribution → manual_test source flows into audit row
 * 11.  Args sanitization → apiKey field redacted in audit payload
 * 12.  System call (agentDraftId=-1) → bypasses allowedTools but still audits
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseToolName,
  sanitizeArgsForAudit,
  dispatchMcpToolCall,
} from "../dispatcher";
import * as registry from "../registry";

// ── Mocks ──────────────────────────────────────────────────────────────────
//
// We mock the three external collaborators the dispatcher imports:
//  - repo (DB access)
//  - getMcpConnection (live connection lookup)
//  - governance-adapter (pre/post invoke checks)
//
// Each test sets up the exact behavior it needs via the mocks then calls
// dispatchMcpToolCall with a fully-formed input.

vi.mock("../../../repository", () => ({
  listMcpServers: vi.fn(),
  listAllMcpServers: vi.fn(),
  listPermissionRules: vi.fn(),
  appendRuntimePolicyEvent: vi.fn(),
  getDraftById: vi.fn(),
  getMcpServerById: vi.fn(),
}));

vi.mock("../mcp-manager", () => ({
  getMcpConnection: vi.fn(),
}));

vi.mock("../../governance-adapter", () => ({
  evaluateMcpPreInvoke: vi.fn(),
  evaluateMcpPostInvoke: vi.fn(),
}));

// H2-c5 — mock the riskClass classifier + the sandbox surface so the
// `if (riskClass === "code_execution")` routing branch in dispatcher.ts
// can be exercised without a live sandbox.
vi.mock("../../cag", () => ({
  readRiskClass: vi.fn(),
}));

vi.mock("../../sandbox", () => ({
  getToolSandbox: vi.fn(),
  DEFAULT_SANDBOX_POLICY: { timeoutMs: 5000, memoryMb: 64 },
  SandboxUnavailableError: class SandboxUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SandboxUnavailableError";
    }
  },
}));

import * as repo from "../../../repository";
import { getMcpConnection } from "../mcp-manager";
import {
  evaluateMcpPreInvoke,
  evaluateMcpPostInvoke,
} from "../../governance-adapter";
import { readRiskClass } from "../../cag";
import { getToolSandbox } from "../../sandbox";

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeServerRow(overrides: Partial<{ id: number; name: string }> = {}) {
  return {
    id: 1,
    name: "github",
    draftId: 100,
    transport: "stdio",
    enabled: true,
    status: "connected",
    ...overrides,
  };
}

function makeConn(toolNames: string[] = ["create_issue", "list_issues"]) {
  return {
    serverId: 1,
    transport: "stdio",
    tools: toolNames.map((name) => ({ name, description: name })),
    prompts: [],
    resources: [],
    close: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn().mockResolvedValue({ ok: true, data: "called" }),
  };
}

/**
 * Phase 19c: the dispatcher reads tool existence from the registry,
 * not from `conn.tools` directly. Test setup publishes a snapshot to
 * mirror what `connectMcpServer` would do in production.
 */
function publishConnSnapshot(serverId: number, conn: ReturnType<typeof makeConn>) {
  registry.publishSnapshot({
    serverId,
    tools: conn.tools as any,
    prompts: conn.prompts as any,
    resources: conn.resources as any,
  });
}

function expectAuditCalled(decision: "allow" | "deny" | "warn") {
  expect(repo.appendRuntimePolicyEvent).toHaveBeenCalled();
  const call = (repo.appendRuntimePolicyEvent as any).mock.calls[0][0];
  expect(call.policyKey).toBe("mcp_dispatch");
  expect(call.decision).toBe(decision);
  return call;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Phase 19c: clear the registry between tests so a previous test's
  // snapshot doesn't leak into the next.
  registry.__clearAllSnapshotsForTests();
  // Default: allowed by everything
  (repo.listMcpServers as any).mockResolvedValue([makeServerRow()]);
  (repo.listAllMcpServers as any).mockResolvedValue([makeServerRow()]);
  (repo.listPermissionRules as any).mockResolvedValue([
    { toolPattern: "mcp__*", ruleBehavior: "allow", enabled: true },
  ]);
  (repo.appendRuntimePolicyEvent as any).mockResolvedValue({ id: 999 });
  (repo.getDraftById as any).mockResolvedValue({
    id: 100,
    governancePolicy: {},
  });
  // Default conn + matching registry snapshot
  const defaultConn = makeConn();
  (getMcpConnection as any).mockReturnValue(defaultConn);
  publishConnSnapshot(1, defaultConn);
  (evaluateMcpPreInvoke as any).mockResolvedValue({ verdict: "allow" });
  (evaluateMcpPostInvoke as any).mockResolvedValue({ verdict: "allow" });
  // H2-c5 default: non-code_execution → routes to direct transport.
  // Individual tests override `readRiskClass` to exercise the sandbox
  // branch.
  (readRiskClass as any).mockReturnValue("read_only");
  (getToolSandbox as any).mockReturnValue({
    execute: vi.fn().mockResolvedValue({ ok: true, result: "sandbox-result" }),
  });
});

// ── parseToolName (unit helper, no mocks needed) ──────────────────────────

describe("parseToolName", () => {
  it("parses mcp__server__tool correctly", () => {
    const r = parseToolName("mcp__github__create_issue");
    expect(r.ok).toBe(true);
    expect(r.serverName).toBe("github");
    expect(r.remoteToolName).toBe("create_issue");
  });

  it("preserves tool names containing underscores", () => {
    const r = parseToolName("mcp__db__list_user_records");
    expect(r.ok).toBe(true);
    expect(r.serverName).toBe("db");
    expect(r.remoteToolName).toBe("list_user_records");
  });

  it("rejects empty tool name", () => {
    expect(parseToolName("").ok).toBe(false);
  });

  it("rejects names without mcp__ prefix", () => {
    expect(parseToolName("github__create_issue").ok).toBe(false);
  });

  it("rejects names with empty server or tool", () => {
    expect(parseToolName("mcp____tool").ok).toBe(false);
    expect(parseToolName("mcp__server__").ok).toBe(false);
  });
});

// ── sanitizeArgsForAudit ───────────────────────────────────────────────────

describe("sanitizeArgsForAudit", () => {
  it("redacts apiKey, password, secret, token, auth fields", () => {
    const sanitized = sanitizeArgsForAudit({
      apiKey: "secret123",
      password: "hunter2",
      authToken: "bearer-xyz",
      title: "public title",
    });
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.authToken).toBe("[REDACTED]");
    expect(sanitized.title).toBe("public title");
  });

  it("recurses into nested objects", () => {
    const sanitized = sanitizeArgsForAudit({
      config: { apiKey: "deep", visible: 1 },
    });
    expect((sanitized.config as any).apiKey).toBe("[REDACTED]");
    expect((sanitized.config as any).visible).toBe(1);
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "x" };
    sanitizeArgsForAudit(input);
    expect(input.apiKey).toBe("x");
  });
});

// ── Dispatcher integration ─────────────────────────────────────────────────

describe("dispatchMcpToolCall", () => {
  // ── 1. Happy path ──
  it("returns ok:true with audit row + governance verdict on success", async () => {
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: { title: "bug" },
      source: "simulation",
    });
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ ok: true, data: "called" });
    expect(result.auditId).toBe(999);
    expect(result.governanceVerdict).toBe("allow");
    expectAuditCalled("allow");
    expect(evaluateMcpPreInvoke).toHaveBeenCalled();
    expect(evaluateMcpPostInvoke).toHaveBeenCalled();
  });

  // ── 2. Invalid tool name ──
  it("returns invalid_tool_name for malformed names", async () => {
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "not-a-valid-tool",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_tool_name");
  });

  // ── 3. Server not found ──
  it("returns server_not_found when server name doesn't match any draft server", async () => {
    (repo.listMcpServers as any).mockResolvedValue([]);
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__nonexistent__tool",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("server_not_found");
  });

  // ── 4. Server not connected ──
  it("returns server_not_connected when getMcpConnection returns undefined", async () => {
    (getMcpConnection as any).mockReturnValue(undefined);
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("server_not_connected");
  });

  // ── 5. Tool not on server ──
  it("returns tool_not_found when the tool isn't in the registry snapshot", async () => {
    // Phase 19c: dispatcher reads from registry, not conn.tools.
    // Both conn AND snapshot need updating.
    const conn = makeConn(["other_tool"]);
    (getMcpConnection as any).mockReturnValue(conn);
    registry.__clearAllSnapshotsForTests();
    publishConnSnapshot(1, conn);
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_not_found");
  });

  // ── 6. allowedTools rejects ──
  it("returns not_authorized when allowedTools denies the tool", async () => {
    (repo.listPermissionRules as any).mockResolvedValue([
      { toolPattern: "mcp__github__*", ruleBehavior: "deny", enabled: true },
    ]);
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("not_authorized");
    expectAuditCalled("deny");
    // Tool was NOT invoked
    const conn = (getMcpConnection as any).mock.results[0].value;
    expect(conn.callTool).not.toHaveBeenCalled();
  });

  // ── 7. Governance pre-invoke denies ──
  it("returns governance_blocked when pre-invoke denies", async () => {
    (evaluateMcpPreInvoke as any).mockResolvedValue({
      verdict: "deny",
      reason: "policy says no",
    });
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("governance_blocked");
    expectAuditCalled("deny");
    // Tool was NOT invoked
    const conn = (getMcpConnection as any).mock.results[0].value;
    expect(conn.callTool).not.toHaveBeenCalled();
  });

  // ── 8. conn.callTool throws ──
  it("returns tool_execution_failed when conn.callTool throws", async () => {
    const conn = makeConn();
    conn.callTool = vi.fn().mockRejectedValue(new Error("network down"));
    (getMcpConnection as any).mockReturnValue(conn);
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_execution_failed");
    expect(result.error?.message).toContain("network down");
    expectAuditCalled("deny");
  });

  // ── 9. Slow call (post-invoke warn) ──
  it("flows post-invoke warn verdict into the audit row", async () => {
    (evaluateMcpPostInvoke as any).mockResolvedValue({
      verdict: "warn",
      reason: "slow",
    });
    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "simulation",
    });
    expect(result.ok).toBe(true);
    const audit = expectAuditCalled("warn");
    expect(audit.payload.postVerdict).toBe("warn");
  });

  // ── 10. Source attribution ──
  it("flows source: manual_test into the audit row", async () => {
    await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "manual_test",
    });
    const audit = expectAuditCalled("allow");
    expect(audit.payload.source).toBe("manual_test");
  });

  // ── 11. Args sanitization ──
  it("redacts apiKey in the audit row's argsPreview", async () => {
    await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: { apiKey: "ghs_secret", title: "public" },
      source: "simulation",
    });
    const audit = expectAuditCalled("allow");
    expect(audit.payload.argsPreview.apiKey).toBe("[REDACTED]");
    expect(audit.payload.argsPreview.title).toBe("public");
  });

  // ── 12. System call bypasses allowedTools ──
  it("agentDraftId=-1 bypasses allowedTools but still audits", async () => {
    // Even with a deny rule, system calls should pass authorization
    (repo.listPermissionRules as any).mockResolvedValue([
      { toolPattern: "*", ruleBehavior: "deny", enabled: true },
    ]);
    const result = await dispatchMcpToolCall({
      agentDraftId: -1,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "manual_test",
    });
    expect(result.ok).toBe(true);
    expectAuditCalled("allow");
    // System calls also bypass governance
    expect(evaluateMcpPreInvoke).toHaveBeenCalled(); // called, but returns allow for -1
  });

  // ── H2-c5 ── 13. Sandbox routing branch (D-SBX-3 contract) ──
  // Cycle-5 audit (`/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md` §H2-c5)
  // flagged that the dispatcher's `if (riskClass === "code_execution") →
  // sandbox` branch had ZERO unit tests. The sandbox itself is tested
  // separately (sandbox-gate.test.ts, 14 cases real impl); the
  // dispatcher's BRANCHING was dark. A regression that flipped the
  // conditional or broke readRiskClass would silently route
  // code_execution tools to direct transport — bypassing the sandbox.
  it("riskClass=code_execution routes to sandbox.execute() and NOT to conn.callTool() (H2-c5)", async () => {
    (readRiskClass as any).mockReturnValue("code_execution");
    const sandbox = {
      execute: vi
        .fn()
        .mockResolvedValue({ ok: true, result: "sandbox-output" }),
    };
    (getToolSandbox as any).mockReturnValue(sandbox);
    const conn = makeConn();
    (getMcpConnection as any).mockReturnValue(conn);
    publishConnSnapshot(1, conn);

    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: { script: "print(1)" },
      source: "live_runtime",
    });

    expect(result.ok).toBe(true);
    expect(sandbox.execute).toHaveBeenCalledTimes(1);
    expect(conn.callTool).not.toHaveBeenCalled();
  });

  it("non-code_execution riskClass routes to conn.callTool() and NOT to sandbox (H2-c5)", async () => {
    // Cycle-5 §H2-c5: "for all 7 non-code_execution classes, dispatcher
    // invokes conn.callTool() and does NOT call sandbox". Spot-check
    // 3 representative classes (read_only, write, governance_sensitive)
    // — full taxonomy is locked by retrofit-acceptance D-TOOL-1 (8-class
    // round-trip).
    for (const klass of ["read_only", "write", "governance_sensitive"] as const) {
      vi.clearAllMocks();
      (repo.listMcpServers as any).mockResolvedValue([makeServerRow()]);
      (repo.listPermissionRules as any).mockResolvedValue([
        { toolPattern: "mcp__*", ruleBehavior: "allow", enabled: true },
      ]);
      (repo.appendRuntimePolicyEvent as any).mockResolvedValue({ id: 999 });
      (repo.getDraftById as any).mockResolvedValue({
        id: 100,
        governancePolicy: {},
      });
      const conn = makeConn();
      (getMcpConnection as any).mockReturnValue(conn);
      publishConnSnapshot(1, conn);
      (evaluateMcpPreInvoke as any).mockResolvedValue({ verdict: "allow" });
      (evaluateMcpPostInvoke as any).mockResolvedValue({ verdict: "allow" });
      (readRiskClass as any).mockReturnValue(klass);
      const sandbox = { execute: vi.fn() };
      (getToolSandbox as any).mockReturnValue(sandbox);

      const result = await dispatchMcpToolCall({
        agentDraftId: 100,
        runtimeRunId: 5,
        toolName: "mcp__github__create_issue",
        args: {},
        source: "live_runtime",
      });

      expect(result.ok, `riskClass=${klass} dispatch failed`).toBe(true);
      expect(
        conn.callTool,
        `riskClass=${klass} should call conn.callTool`,
      ).toHaveBeenCalledTimes(1);
      expect(
        sandbox.execute,
        `riskClass=${klass} must NOT route to sandbox`,
      ).not.toHaveBeenCalled();
    }
  });

  // ── H2-c5 ── 14. Pre/post-invoke symmetry (locks "intentional absence") ──
  // Cycle-5 §M5-c5: pre-invoke deny short-circuits at dispatcher.ts:451-456;
  // post-invoke at line 516 never runs in that path. Correct but undocumented
  // in tests. A regression that adds post-invoke to the pre-deny path (or
  // removes the early return) would not fire any test.
  it("pre-invoke denied → evaluateMcpPostInvoke is NOT called (M5-c5 lockstep)", async () => {
    (evaluateMcpPreInvoke as any).mockResolvedValue({
      verdict: "deny",
      reason: "blocked-action-test",
    });

    const result = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: {},
      source: "live_runtime",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("governance_blocked");
    expect(evaluateMcpPreInvoke).toHaveBeenCalledTimes(1);
    // The invariant under test: post-invoke is intentionally skipped on
    // pre-deny. The dispatcher's audit row covers the deny event; no
    // post-invoke verdict exists because the tool never invoked.
    expect(evaluateMcpPostInvoke).not.toHaveBeenCalled();
  });

  // ── H2-c5 ── 15. Idempotency: repeated dispatch produces distinct audit rows ──
  // Cycle-5 §L3-c5: dispatcher comment at line 249-251 doesn't address
  // re-dispatch. The contract IS "one audit row per invocation"; this
  // test locks it.
  it("repeated dispatch with identical input produces distinct audit rows (L3-c5)", async () => {
    const result1 = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: { title: "A" },
      source: "live_runtime",
    });
    const result2 = await dispatchMcpToolCall({
      agentDraftId: 100,
      runtimeRunId: 5,
      toolName: "mcp__github__create_issue",
      args: { title: "A" },
      source: "live_runtime",
    });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(repo.appendRuntimePolicyEvent).toHaveBeenCalledTimes(2);
    // Each invocation produces a distinct row id (mock returns id=999
    // for both, but the spy records two separate calls — that's the
    // invariant: dispatcher emits one row per call, never deduplicates).
  });
});
