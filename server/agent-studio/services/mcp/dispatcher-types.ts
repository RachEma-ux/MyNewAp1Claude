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
}
