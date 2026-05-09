/**
 * AI Agent Studio — MCP Dispatcher (Phase 19a, the keystone)
 *
 * Single chokepoint for ALL MCP tool invocations in the codebase. After
 * Phase 19a, every MCP `tools/call` goes through `dispatchMcpToolCall`.
 * Direct `conn.callTool(...)` invocations are forbidden outside this
 * file (the `mcpManager.callMcpTool` shim and the simulation engine
 * both delegate here).
 *
 * Responsibilities:
 *   1. Input validation
 *   2. Tool name parsing (`mcp__server__tool`)
 *   3. Server lookup + connection state check
 *   4. Tool existence check on the connected server
 *   5. Per-agent allowedTools authorization (from agsDraftPermissionRules)
 *   6. Governance pre-invoke evaluation
 *   7. Actual `conn.callTool()` invocation
 *   8. Error normalization
 *   9. Latency capture
 *  10. Governance post-invoke evaluation
 *  11. Audit row write to `agsRuntimePolicyEvents` (sync, decision #5a)
 *  12. Structured result return
 *
 * The dispatcher is the SINGLE governance integration point for MCP
 * calls. Today every MCP call is ungoverned; after Phase 19a every
 * call is governed and audited through one well-typed function.
 *
 * Authorization order (decision #4a — fast check first):
 *   1. allowedTools (in-memory rules table)
 *   2. governance pre-invoke (may hit policy engine)
 *
 * "ask" rules → treated as deny (decision #3a). The async pending-
 * request flow only exists in the simulation engine; the dispatcher
 * is sync. TODO: revisit if/when async dispatch is needed.
 *
 * L5-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L5-c5) — INTENTIONAL ABSENCES at this layer (lockstep-tested by
 * `tests/agent-studio/dispatcher-layering-coverage.test.ts`):
 *
 *   1. Dispatcher does NOT import from `services/approval/` — approval
 *      gating happens BEFORE dispatch (in `gateRuntimeDispatch` per the
 *      C2-c4 sub-arc). Dispatcher consumes the verdict's permit; it
 *      does not call `evaluateApprovalGate` / `decideApprovalRequest`
 *      itself.
 *   2. Dispatcher does NOT call `approval-gate.decide*` — same boundary.
 *   3. Dispatcher does NOT bypass governance — every non-system path
 *      runs `evaluateMcpPreInvoke` (line ~440); system calls
 *      (agentDraftId=-1) STILL run pre-invoke (it returns "allow" for
 *      -1 by design; the bypass is allowedTools, not governance).
 *   4. Dispatcher does NOT route `code_execution` through `conn.callTool`
 *      — `if (riskClass === "code_execution") → sandbox.execute()`
 *      (line ~468). Mirror invariant locks no false-bypass to direct
 *      transport.
 *   5. Dispatcher does NOT silently skip the audit row when
 *      `runtimeRunId` is provided — `writeAuditRow()` only returns
 *      `undefined` when `runtimeRunId == null` (ad-hoc operator-test
 *      path). C1-c5 closure threaded `runtimeRunId` into all production
 *      paths; the lockstep test in `tests/agent-studio/dispatcher-audit-coverage.test.ts`
 *      pairs with this absence.
 *
 * If a future PR violates any absence, the matching lockstep test
 * fires with explicit remediation guidance. Mirrors the cycle-4
 * `approval-gate.ts` 5-absence doc-block + tests pattern (H1-c4 +
 * H2-c4 + H3-c4 + L1-c4 + M4-c4).
 */

import * as repo from "../../repository";
import { getMcpConnection } from "./mcp-manager";
import * as registry from "./registry";
import {
  evaluateMcpPreInvoke,
  evaluateMcpPostInvoke,
} from "../governance-adapter";
import { readRiskClass } from "../cag";
import {
  getToolSandbox,
  DEFAULT_SANDBOX_POLICY,
  SandboxUnavailableError,
  type ToolSandboxResult,
} from "../sandbox";
import type {
  DispatchMcpToolCallInput,
  DispatchMcpToolCallResult,
  DispatchErrorCode,
  McpDispatchAuditPayload,
} from "./dispatcher-types";
// C1-c7 (cycle-7 audit closure §C1-c7): scrub PII / secrets from
// `result.error.message` at the dispatcher boundary so 3 downstream
// sinks (SSE tool_end / agsToolCallTraces.errorMessage / role="tool"
// LLM message-content) automatically receive the sanitized version.
// The audit payload (`auditPayload.errorMessage`) keeps the RAW
// error for forensics — operators with audit-row read access need
// the unredacted message to debug security incidents.
import { sanitizeMcpErrorMessage } from "./sanitize-error-message";
// H2-c7 (cycle-7 audit closure §H2-c7): MCP response output-schema
// validator. Runs at dispatcher post-invoke (before the success-path
// audit-row write); no-ops when the tool has no outputSchema.
// Mismatches surface as `schema_mismatch_on_output`, distinct from
// `tool_execution_failed`, so model + operator UI can distinguish
// server-returned-an-error from server-returned-wrong-shape.
import { validateMcpToolResponse } from "./result-validator";

// ── Constants ──────────────────────────────────────────────────────────────

/** Synthetic agentDraftId for system/admin calls that bypass allowedTools */
const SYSTEM_DRAFT_ID = -1;

/** Max bytes of result preview written to the audit row payload */
const RESULT_PREVIEW_MAX_BYTES = 4096;

/**
 * H1-c7 (cycle-7 audit closure §H1-c7) — per-call timeout ceiling for
 * `conn.callTool()`. Pre-cycle-7 the dispatcher had no per-call
 * timeout: a slow or hung MCP server could block the model loop
 * indefinitely. Sandbox tools have `DEFAULT_SANDBOX_POLICY.timeoutMs`
 * (1s) and SSE transport has `POST_TIMEOUT_MS=5s` buried at the
 * transport layer, but neither was exposed to the dispatcher and
 * neither covered the non-sandbox / non-SSE paths.
 *
 * 30s default is generous for MCP servers (covers common HTTP/RPC
 * round-trips + 1-2 retries at the transport layer) but bounded.
 * Operator override via `MCP_TOOL_CALL_TIMEOUT_MS` env var — useful
 * for tools known to take longer (e.g. long-running search /
 * generation MCP servers); operator must understand the trade-off
 * (longer timeout = longer wait for hung servers).
 *
 * On timeout the dispatcher returns `DispatchErrorCode.tool_call_timeout`
 * (distinct from `tool_execution_failed`) so audit + trace can
 * distinguish "server returned an error" from "server didn't respond
 * within ceiling."
 */
const MCP_TOOL_CALL_TIMEOUT_MS = (() => {
  const raw = process.env.MCP_TOOL_CALL_TIMEOUT_MS;
  if (!raw) return 30_000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[mcp-dispatcher] MCP_TOOL_CALL_TIMEOUT_MS=${raw} is not a positive integer; using default 30000ms`,
    );
    return 30_000;
  }
  return n;
})();

/** Sentinel marker on invokeError to identify timeout vs other failures. */
const TIMEOUT_SENTINEL = Symbol("mcp-tool-call-timeout");

/**
 * H1-c7: race conn.callTool() against a timeout. Returns the result
 * or throws a tagged error the caller can distinguish from MCP
 * server errors.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            `MCP tool call exceeded ${timeoutMs}ms timeout`,
          ) as Error & { [TIMEOUT_SENTINEL]?: true };
          err[TIMEOUT_SENTINEL] = true;
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Type guard for the timeout sentinel — used by the invoke-error mapping. */
function isTimeoutError(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    (e as Record<symbol, unknown>)[TIMEOUT_SENTINEL] === true
  );
}

/**
 * H3-c7 (cycle-7 audit closure §H3-c7): map a `ToolSandboxErrorCode`
 * to a `DispatchErrorCode` so the dispatcher's structured error
 * surface preserves the sandbox failure mode for audit + trace +
 * operator UI.
 *
 * Pre-cycle-7 every sandbox failure collapsed to
 * `tool_execution_failed`. Operator forensics could not distinguish
 * "policy denied this code" (config issue, not retryable) from
 * "sandbox unavailable" (infra issue, retryable after restart) from
 * "user code threw" (tool semantics, not retryable). The mapping
 * function makes each failure visible at the dispatcher boundary.
 *
 * Returns null when the input doesn't match a known SBX_* code —
 * the caller should fall through to `tool_execution_failed` so
 * unknown sandbox codes still produce a typed dispatch error.
 */
function mapSandboxCodeToDispatchCode(
  sandboxCode: string | undefined,
): DispatchErrorCode | null {
  switch (sandboxCode) {
    case "SBX_TIMEOUT":
      return "sandbox_timeout";
    case "SBX_MEMORY":
      return "sandbox_memory";
    case "SBX_DENY_GLOBAL":
      return "sandbox_policy_denied";
    case "SBX_UNAVAILABLE":
      return "sandbox_unavailable";
    case "SBX_THROWN":
      return "sandbox_thrown";
    default:
      return null;
  }
}

/**
 * Field names whose values get redacted in the audit payload's
 * argsPreview. Anything matching these (case-insensitive substring)
 * is replaced with `"[REDACTED]"`. Compliance + security baseline.
 */
const REDACT_FIELD_PATTERNS = [
  "apikey",
  "api_key",
  "password",
  "secret",
  "token",
  "auth",
  "credential",
  "private_key",
  "privatekey",
];

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Parse `mcp__server__tool` into its components.
 *
 * Strict 3-component parser (R4 mitigation). The server name may NOT
 * contain `__`. We split on the FIRST `__` after the prefix and treat
 * everything after as the tool name. If the tool name itself contains
 * `__` that is fine (some MCP servers do this).
 */
export function parseToolName(toolName: string): {
  ok: boolean;
  serverName?: string;
  remoteToolName?: string;
  error?: string;
} {
  if (typeof toolName !== "string" || toolName.length === 0) {
    return { ok: false, error: "tool name is empty" };
  }
  if (!toolName.startsWith("mcp__")) {
    return { ok: false, error: "tool name must start with mcp__" };
  }
  const rest = toolName.slice("mcp__".length);
  const sepIdx = rest.indexOf("__");
  if (sepIdx <= 0) {
    return {
      ok: false,
      error: "tool name must be mcp__<server>__<tool> with both parts non-empty",
    };
  }
  const serverName = rest.slice(0, sepIdx);
  const remoteToolName = rest.slice(sepIdx + 2);
  if (remoteToolName.length === 0) {
    return { ok: false, error: "tool name component is empty" };
  }
  return { ok: true, serverName, remoteToolName };
}

/**
 * Tool pattern matcher — duplicates `simulation.ts:matchesToolPattern`
 * intentionally. The function is 16 lines, has zero deps, and lives
 * in two places that have orthogonal lifecycles (the simulation engine
 * is for the live-runtime permission resolver; the dispatcher is for
 * MCP call authorization). A shared 1-function module is premature
 * abstraction per project guidelines.
 *
 * Mirrors openllm-agent2's matcher semantics:
 *  - exact match: "Bash" matches "Bash"
 *  - parens form: "Bash(*)" matches "Bash" with any args
 *  - wildcard:    "Web*" matches "WebFetch", "WebSearch"
 *  - "*" matches anything
 */
function matchesToolPattern(toolName: string, pattern: string): boolean {
  if (!toolName || !pattern) return false;
  if (pattern === "*") return true;
  if (pattern === toolName) return true;
  const noParen = pattern.replace(/\s*\(\*\)\s*$/, "");
  if (noParen === toolName) return true;
  if (pattern.includes("*")) {
    const regexBody = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const re = new RegExp(`^${regexBody}$`);
    if (re.test(toolName)) return true;
  }
  return false;
}

/**
 * Sanitize args for the audit row. Redacts any field whose name
 * matches REDACT_FIELD_PATTERNS. Recursive for nested objects.
 *
 * Returned object is a clone — never mutates the input.
 */
export function sanitizeArgsForAudit(
  args: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const lk = key.toLowerCase();
    const isSecret = REDACT_FIELD_PATTERNS.some((p) => lk.includes(p));
    if (isSecret) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeArgsForAudit(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Truncate the result preview written to the audit row payload.
 * Bytes (not chars) — JSON-stringified, then sliced.
 */
function truncateResultPreview(result: unknown): unknown {
  if (result == null) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(result);
  } catch {
    return "[unserializable result]";
  }
  if (serialized.length <= RESULT_PREVIEW_MAX_BYTES) {
    // Re-parse to keep it as structured data when small
    try {
      return JSON.parse(serialized);
    } catch {
      return serialized;
    }
  }
  return serialized.slice(0, RESULT_PREVIEW_MAX_BYTES) + "…[truncated]";
}

// ── Authorization ──────────────────────────────────────────────────────────

/**
 * Resolve the agent's allowedTools verdict for a given tool name.
 *
 * Returns:
 *  - "allow"  → rule explicitly permits this tool
 *  - "deny"   → rule explicitly denies, OR no matching rule (safe default)
 *  - "ask"    → rule says ask. Dispatcher treats as "deny" (decision #3a)
 *  - "skip"   → no rules at all → bypass (the draft hasn't configured
 *               permissions yet, treat as wide open). This matches the
 *               behavior simulation.ts has today for unconfigured drafts.
 */
async function checkAllowedTools(
  agentDraftId: number,
  fullToolName: string
): Promise<"allow" | "deny" | "ask" | "skip"> {
  // System calls bypass the allowedTools check entirely (decision #2a).
  // Used by the legacy `mcpManager.callMcpTool` shim.
  if (agentDraftId === SYSTEM_DRAFT_ID) return "skip";

  let rules: Array<{
    toolPattern: string;
    ruleBehavior: string;
    enabled: boolean | null;
  }>;
  try {
    rules = await repo.listPermissionRules(agentDraftId);
  } catch {
    // DB read failed — fail closed
    return "deny";
  }
  const enabled = rules.filter((r) => r.enabled !== false);
  if (enabled.length === 0) return "skip";

  for (const rule of enabled) {
    if (matchesToolPattern(fullToolName, rule.toolPattern)) {
      if (rule.ruleBehavior === "allow") return "allow";
      if (rule.ruleBehavior === "ask") return "ask";
      return "deny";
    }
  }
  return "deny";
}

// ── Audit ──────────────────────────────────────────────────────────────────

/**
 * Write the audit row. Sync (decision #5a — correctness over latency).
 * Returns the row id, or undefined if the runId is missing (ad-hoc calls
 * that aren't tied to a runtime run can't write to agsRuntimePolicyEvents
 * which has a non-null runId column).
 */
async function writeAuditRow(input: {
  runtimeRunId?: number;
  decision: "allow" | "deny" | "warn";
  reason?: string;
  payload: McpDispatchAuditPayload;
}): Promise<number | undefined> {
  if (input.runtimeRunId == null) return undefined;
  try {
    const row = await repo.appendRuntimePolicyEvent({
      runId: input.runtimeRunId,
      policyKey: "mcp_dispatch",
      decision: input.decision,
      reason: input.reason,
      payload: input.payload as unknown as Record<string, unknown>,
    });
    return row.id;
  } catch (e) {
    // R5: audit insert failure is treated as fatal — the caller must
    // see this and decide whether to retry. We re-throw so the
    // dispatcher's outer try/catch turns it into `internal_error`.
    throw new Error(
      `Audit row write failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Dispatch an MCP tool call through the full validate → authorize →
 * govern → invoke → audit pipeline. Always returns a structured
 * result; never throws (internal errors become `internal_error` results).
 */
export async function dispatchMcpToolCall(
  input: DispatchMcpToolCallInput
): Promise<DispatchMcpToolCallResult> {
  const startMs = Date.now();

  // Per-call audit accumulators — populated as we progress through
  // the pipeline so the audit row reflects whatever happened, even
  // on early returns.
  const auditPayload: McpDispatchAuditPayload = {
    serverId: null,
    serverName: null,
    remoteToolName: null,
    source: input.source,
    agentDraftId: input.agentDraftId,
    argsPreview: sanitizeArgsForAudit(input.args ?? {}),
    resultPreview: null,
    errorCode: null,
    errorMessage: null,
    preVerdict: null,
    postVerdict: null,
    durationMs: 0,
    cost: null,
    caller: input.caller ?? null,
    // M4-c5: thread approval-request id from caller into the audit
    // row so forensics doesn't need the dispatcher → trace → approval
    // two-hop join.
    approvalRequestId: input.approvalRequestId ?? null,
    // H3-c7: structured sandbox error code surfaced on sandbox-route
    // failures (riskClass === "code_execution"). Null on non-sandbox
    // dispatches and successful sandbox runs. Lets operator forensics
    // filter "all sandbox timeouts in the last hour" without parsing
    // errorMessage.
    sandboxErrorCode: null,
  };

  /** Helper to build a structured failure result + write the audit row */
  const fail = async (
    code: DispatchErrorCode,
    message: string,
    details?: Record<string, unknown>
  ): Promise<DispatchMcpToolCallResult> => {
    // C1-c7: audit row keeps the RAW message (forensics); the
    // returned result carries the SANITIZED message (operator-UI /
    // LLM / SSE).
    auditPayload.errorCode = code;
    auditPayload.errorMessage = message;
    auditPayload.durationMs = Date.now() - startMs;
    let auditId: number | undefined;
    try {
      auditId = await writeAuditRow({
        runtimeRunId: input.runtimeRunId,
        decision: "deny",
        reason: message,
        payload: auditPayload,
      });
    } catch {
      // Audit write failed during a fail() — return internal_error.
      // Sanitize the inner message before exposing it.
      return {
        ok: false,
        error: {
          code: "internal_error",
          message:
            sanitizeMcpErrorMessage(
              `Audit write failed while reporting ${code}: ${message}`,
            ) ?? "internal error",
        },
        durationMs: Date.now() - startMs,
      };
    }
    return {
      ok: false,
      error: {
        code,
        message: sanitizeMcpErrorMessage(message) ?? message,
        details,
      },
      durationMs: auditPayload.durationMs,
      auditId,
      governanceVerdict: auditPayload.preVerdict ?? undefined,
    };
  };

  // ── 1. Parse the tool name ──
  const parsed = parseToolName(input.toolName);
  if (!parsed.ok) {
    return fail("invalid_tool_name", parsed.error ?? "invalid tool name");
  }
  auditPayload.serverName = parsed.serverName ?? null;
  auditPayload.remoteToolName = parsed.remoteToolName ?? null;

  // ── 2. Look up the per-draft MCP server row by name ──
  // For SYSTEM_DRAFT_ID, we have to scan ALL servers (no draft scope) —
  // this matches the legacy `mcpManager.callMcpTool` semantics where
  // callers pass a serverId directly.
  let serverId: number | null = null;
  try {
    if (input.agentDraftId === SYSTEM_DRAFT_ID) {
      const all = await repo.listAllMcpServers();
      const match = all.find((s) => s.name === parsed.serverName);
      serverId = match?.id ?? null;
    } else {
      const draftServers = await repo.listMcpServers(input.agentDraftId);
      const match = draftServers.find((s) => s.name === parsed.serverName);
      serverId = match?.id ?? null;
    }
  } catch (e) {
    return fail(
      "internal_error",
      `Failed to look up MCP server: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (serverId == null) {
    return fail(
      "server_not_found",
      `MCP server "${parsed.serverName}" not found ${
        input.agentDraftId === SYSTEM_DRAFT_ID
          ? "across any draft"
          : `attached to draft ${input.agentDraftId}`
      }`
    );
  }
  auditPayload.serverId = serverId;

  // ── 3. Check the live connection ──
  const conn = getMcpConnection(serverId);
  if (!conn) {
    return fail(
      "server_not_connected",
      `MCP server "${parsed.serverName}" (id=${serverId}) is not currently connected — call connectMcpServer first`
    );
  }

  // ── 4. Check the tool exists on the connected server ──
  // Phase 19c: read via the versioned registry instead of conn.tools
  // directly. The snapshot is frozen so we can't see torn writes if
  // a future tools/list_changed handler is mid-republish.
  const tool = registry.findToolForServer(serverId, parsed.remoteToolName!);
  if (!tool) {
    const snap = registry.getSnapshot(serverId);
    const available =
      snap && snap.tools.length > 0
        ? snap.tools.map((t) => t.name).join(", ")
        : "(none)";
    return fail(
      "tool_not_found",
      `Tool "${parsed.remoteToolName}" not advertised by server "${parsed.serverName}". Available: ${available}`
    );
  }

  // ── 5. allowedTools authorization (decision #4a — fast first) ──
  const authVerdict = await checkAllowedTools(
    input.agentDraftId,
    input.toolName
  );
  if (authVerdict === "deny" || authVerdict === "ask") {
    return fail(
      "not_authorized",
      authVerdict === "ask"
        ? `Tool "${input.toolName}" requires human approval ("ask" rule). The dispatcher path is sync — use the simulation engine for the human-approval flow.`
        : `Tool "${input.toolName}" denied by agent's permission rules`
    );
  }

  // ── 6. Governance pre-invoke ──
  let preVerdict: "allow" | "deny" | "warn";
  let preReason: string | undefined;
  try {
    const pre = await evaluateMcpPreInvoke({
      agentDraftId: input.agentDraftId,
      toolName: input.toolName,
      serverName: parsed.serverName!,
      remoteToolName: parsed.remoteToolName!,
      args: input.args,
      source: input.source,
    });
    preVerdict = pre.verdict;
    preReason = pre.reason;
  } catch (e) {
    return fail(
      "internal_error",
      `Governance pre-invoke threw: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  auditPayload.preVerdict = preVerdict;

  if (preVerdict === "deny") {
    return fail(
      "governance_blocked",
      preReason ?? "Blocked by governance pre-invoke check"
    );
  }

  // ── 7. Invoke the tool ──
  // RAC P9 — D-SBX-3 gate: tools classified as code_execution MUST
  // run inside the ToolSandbox (D-SBX-IMPL-1: node:vm). All other
  // risk classes invoke the MCP transport directly. The dispatcher
  // reads riskClass via the CAG classifier (D-TOOL-5: single source
  // of truth across CAG, dispatcher, and export readiness).
  const riskClass = readRiskClass(tool as Parameters<typeof readRiskClass>[0]);
  let result: unknown;
  let invokeError: { message: string; original: unknown; sandboxCode?: string; timedOut?: boolean } | null = null;
  const invokeStartMs = Date.now();
  if (riskClass === "code_execution") {
    try {
      const sandbox = getToolSandbox();
      const sandboxResult: ToolSandboxResult = await sandbox.execute({
        toolName: input.toolName,
        args: input.args ?? {},
        policy: DEFAULT_SANDBOX_POLICY,
        ctx: {
          // Dispatcher input doesn't carry a workspaceId; the sandbox
          // ctx is correlation-only (D-SBX-IMPL-2 §3) so 0 is a sentinel.
          workspaceId: 0,
          actorId: input.caller?.userId ?? 0,
          correlationId: String(input.runtimeRunId ?? input.agentDraftId),
        },
      });
      if (sandboxResult.ok) {
        result = sandboxResult.output;
      } else {
        invokeError = {
          message: sandboxResult.error?.message ?? "sandbox returned ok=false without an error code",
          original: sandboxResult.error,
          sandboxCode: sandboxResult.error?.code,
        };
      }
    } catch (e) {
      // SandboxUnavailableError + any unhandled throws funnel here.
      const code = e instanceof SandboxUnavailableError ? "SBX_UNAVAILABLE" : undefined;
      invokeError = {
        message: e instanceof Error ? e.message : String(e),
        original: e,
        sandboxCode: code,
      };
    }
  } else {
    try {
      // H1-c7: bounded wait — if the MCP server doesn't respond
      // within MCP_TOOL_CALL_TIMEOUT_MS, the race rejects with a
      // sentinel-tagged error that the failure-mapping path
      // surfaces as `tool_call_timeout` (distinct from
      // `tool_execution_failed`).
      result = await withTimeout(
        conn.callTool(parsed.remoteToolName!, input.args ?? {}),
        MCP_TOOL_CALL_TIMEOUT_MS,
      );
    } catch (e) {
      invokeError = {
        message: e instanceof Error ? e.message : String(e),
        original: e,
        timedOut: isTimeoutError(e),
      };
    }
  }
  const invokeDurationMs = Date.now() - invokeStartMs;

  // ── 8. Governance post-invoke (always runs, even on invoke error) ──
  let postVerdict: "allow" | "warn" | undefined;
  try {
    const post = await evaluateMcpPostInvoke({
      agentDraftId: input.agentDraftId,
      toolName: input.toolName,
      serverName: parsed.serverName!,
      remoteToolName: parsed.remoteToolName!,
      durationMs: invokeDurationMs,
      ok: invokeError == null,
      result: invokeError == null ? result : undefined,
      errorMessage: invokeError?.message,
    });
    postVerdict = post.verdict;
  } catch {
    // Post-invoke failure does not change the dispatch outcome — just
    // log it via the audit row's postVerdict=undefined slot.
  }
  auditPayload.postVerdict = postVerdict ?? null;

  // ── 9. Handle invoke failure ──
  if (invokeError) {
    // H3-c7: structured sandbox-error-code in audit payload (set
    // BEFORE fail() so the audit row carries the SBX_* signal even
    // on failure). Null on non-sandbox failures.
    auditPayload.sandboxErrorCode = invokeError.sandboxCode ?? null;

    // H1-c7 + H3-c7: distinguish timeout / sandbox-specific / generic
    // failures so audit + trace + operator UI can tell "server didn't
    // respond within ceiling" from "sandbox policy denied this code"
    // from "server returned an error". Operationally distinct
    // (retryable vs not, indicates infra vs config vs tool semantics).
    let code: DispatchErrorCode;
    if (invokeError.timedOut) {
      code = "tool_call_timeout";
    } else {
      const sandboxMapped = mapSandboxCodeToDispatchCode(
        invokeError.sandboxCode,
      );
      code = sandboxMapped ?? "tool_execution_failed";
    }
    return fail(code, invokeError.message, {
      original: String(invokeError.original),
    });
  }

  // ── 9b. H2-c7: validate the response shape against the tool's
  // outputSchema (when advertised). No-op when the tool doesn't
  // declare an outputSchema (most don't yet). Mismatches surface as
  // schema_mismatch_on_output — distinct from tool_execution_failed
  // so audit + trace + operator UI can tell "server returned an
  // error" from "server returned the wrong shape".
  const responseFailure = validateMcpToolResponse(tool, result);
  if (responseFailure) {
    return fail(
      "schema_mismatch_on_output",
      responseFailure.message,
      { code: responseFailure.code },
    );
  }

  // ── 10. Success — write the audit row + return ──
  auditPayload.resultPreview = truncateResultPreview(result);
  auditPayload.durationMs = Date.now() - startMs;

  let auditId: number | undefined;
  try {
    auditId = await writeAuditRow({
      runtimeRunId: input.runtimeRunId,
      decision: postVerdict === "warn" ? "warn" : "allow",
      reason: preReason,
      payload: auditPayload,
    });
  } catch (e) {
    // R5: audit write failure on a successful invoke is also fatal.
    // C1-c7: sanitize the error message before exposing it.
    const rawMessage = `Audit row write failed after successful invoke: ${e instanceof Error ? e.message : String(e)}`;
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: sanitizeMcpErrorMessage(rawMessage) ?? "internal error",
      },
      durationMs: auditPayload.durationMs,
      governanceVerdict: preVerdict,
    };
  }

  return {
    ok: true,
    result,
    durationMs: auditPayload.durationMs,
    auditId,
    governanceVerdict: preVerdict,
  };
}
