/**
 * AI Agent Studio — MCP Dispatcher types
 *
 * Phase 19a. Pure type module — no runtime code, no imports from
 * dispatcher.ts. Lets other modules (simulation.ts, mcp-manager.ts shim,
 * future router endpoints) import dispatcher types without pulling in
 * the dispatcher implementation. Helps tree-shaking and tests.
 */

/** Source of an MCP tool call — affects audit attribution */
export type DispatchSource =
  | "simulation"
  | "live_runtime"
  | "manual_test"
  | "subagent";

/** Structured error codes returned by the dispatcher */
export type DispatchErrorCode =
  | "invalid_tool_name"
  | "server_not_found"
  | "server_not_connected"
  | "tool_not_found"
  | "not_authorized"
  | "governance_blocked"
  | "tool_execution_failed"
  | "tool_call_timeout"
  // H2-c7 (cycle-7 audit closure §H2-c7): MCP server returned a
  // response whose shape doesn't match the tool's advertised
  // outputSchema. Pre-cycle-7 the dispatcher accepted any response
  // unchecked → malformed responses propagated to the trace and
  // the LLM, where the model could reason on garbage data. New
  // result-validator gate at post-invoke catches schema drift /
  // server bugs and surfaces them with this distinct code.
  | "schema_mismatch_on_output"
  // H3-c7 (cycle-7 audit closure §H3-c7): sandbox-specific failure
  // modes that the dispatcher used to collapse into the generic
  // `tool_execution_failed` bucket. Audit + trace + operator UI
  // can now distinguish "policy denied this code" from "sandbox
  // unavailable" from "user code threw" — these are operationally
  // distinct (retryable vs not, indicates infra vs config vs user).
  | "sandbox_timeout"
  | "sandbox_memory"
  | "sandbox_policy_denied"
  | "sandbox_unavailable"
  | "sandbox_thrown"
  | "internal_error";

export interface DispatchMcpToolCallInput {
  /**
   * The agent draft this call belongs to (for allowedTools + audit
   * attribution). Use `-1` for system calls that bypass the per-agent
   * allowedTools check (e.g., the legacy `mcpManager.callMcpTool` shim,
   * admin smoke tests). Decision #2a — backward compat path.
   */
  agentDraftId: number;
  /** Runtime run row for audit linkage. Optional for ad-hoc calls. */
  runtimeRunId?: number;
  /** Tool name in `mcp__server__tool` format */
  toolName: string;
  /** Tool arguments — passed to the MCP server's tools/call RPC */
  args: Record<string, unknown>;
  /** Where the call originated */
  source: DispatchSource;
  /** Optional caller context for audit */
  caller?: { userId?: number; sessionId?: string };
  /**
   * M4-c5 (cycle-5 audit closure §M4-c5): when this dispatch was
   * permitted by an `agsPendingPermissionRequests` row (i.e. the
   * runtime gate's `approvalRequestId`), pass it here so the
   * dispatcher writes it into the audit payload. Eliminates the
   * forensic two-hop reconstruction (audit row → trace row →
   * approval row). Optional — direct/system dispatches that bypass
   * approval omit it.
   */
  approvalRequestId?: number;
}

export interface DispatchMcpToolCallResult {
  ok: boolean;
  /** The MCP server's tools/call response (when ok=true) */
  result?: unknown;
  /** Structured error (when ok=false) */
  error?: {
    code: DispatchErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Total dispatcher latency including governance + invoke + audit */
  durationMs: number;
  /**
   * Audit row id in `agsRuntimePolicyEvents`. Set when an audit row was
   * actually written (always for ok=true; set for ok=false except in
   * `internal_error` paths where the audit write itself failed).
   */
  auditId?: number;
  /** Governance verdict for the pre-invoke check */
  governanceVerdict?: "allow" | "deny" | "warn";
}

/**
 * Shape of the JSON blob written to `agsRuntimePolicyEvents.payload`
 * for every dispatched MCP call. Stable contract — the runs page UI
 * and any external compliance reader keys off these fields.
 */
export interface McpDispatchAuditPayload {
  serverId: number | null;
  serverName: string | null;
  remoteToolName: string | null;
  source: DispatchSource;
  agentDraftId: number;
  argsPreview: Record<string, unknown>;
  resultPreview: unknown | null;
  errorCode: DispatchErrorCode | null;
  errorMessage: string | null;
  preVerdict: "allow" | "deny" | "warn" | null;
  postVerdict: "allow" | "warn" | null;
  durationMs: number;
  cost: number | null;
  caller: { userId?: number; sessionId?: string } | null;
  /**
   * M4-c5: approval-request id when this dispatch was permitted by
   * an `agsPendingPermissionRequests` row. `null` for direct/system
   * paths (e.g., `agentDraftId === -1`, manual ad-hoc tests). Allows
   * forensic reconstruction without the dispatcher → trace → approval
   * two-hop join.
   */
  approvalRequestId: number | null;
  /**
   * H3-c7 (cycle-7 audit closure §H3-c7): when the dispatch routed
   * through the sandbox (`riskClass === "code_execution"`) and the
   * sandbox returned an error, this carries the structured
   * `ToolSandboxErrorCode` (SBX_TIMEOUT / SBX_MEMORY /
   * SBX_DENY_GLOBAL / SBX_UNAVAILABLE / SBX_THROWN). `null` for
   * non-sandbox dispatches and successful sandbox runs. Lets
   * operator forensics filter "all sandbox timeouts in the last
   * hour" without parsing `errorMessage`.
   */
  sandboxErrorCode: string | null;
}
