/**
 * AI Agent Studio — MCP shared types
 *
 * Phase 7 of the Agent Studio remaining-phases plan. Defines the
 * cross-transport types used by the MCP manager and the per-transport
 * connectors.
 */

export interface McpTool {
  /** Tool name as advertised by the server */
  name: string;
  /** Optional human description */
  description?: string;
  /** JSON Schema for the tool's arguments */
  inputSchema?: Record<string, unknown>;
}

/**
 * Phase 17b: A prompt advertised by an MCP server via prompts/list.
 * Bridged to a skill in the catalog by Phase 15e's mcp_prompt source.
 */
export interface McpPrompt {
  name: string;
  description?: string;
  /** Argument list — each entry is { name, description?, required? } */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Phase 17d: A resource advertised by an MCP server via resources/list.
 * Used by ListMcpResourcesTool / ReadMcpResourceTool.
 */
export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * A live MCP connection. Each transport produces one of these. The
 * manager stores them in an in-memory map keyed by serverId.
 */
export interface McpConnection {
  /** The agsDraftMcpServers row id */
  serverId: number;
  /** Transport name: stdio | sse | http | sdk | websocket */
  transport: string;
  /** The tools the server advertised on initialize */
  tools: McpTool[];
  /** Phase 17b: prompts the server advertised, if any. Empty array
   *  when the server doesn't implement prompts/list. */
  prompts: McpPrompt[];
  /** Phase 17d: resources the server advertised, if any */
  resources: McpResource[];
  /** Disconnect — kills the process / closes the socket */
  close: () => Promise<void>;
  /**
   * Send a tools/call request and await the response. Used by the agent
   * loop to invoke an MCP tool. Returns whatever the server sent back
   * inside the JSON-RPC `result` field.
   */
  callTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  /**
   * Phase 17b: invoke a prompt by name. Returns the prompt's expanded
   * messages (the MCP prompts/get response). Optional — connections
   * from servers that don't support prompts return a rejected promise.
   */
  getPrompt?: (
    name: string,
    args?: Record<string, string>
  ) => Promise<unknown>;
  /**
   * Phase 17d: read a resource by URI. Returns the contents.
   */
  readResource?: (uri: string) => Promise<unknown>;
}

// ── Phase 19b: Connection state machine types ──────────────────────────────
//
// Discriminated union of MCP connection states. Lives in the in-memory
// states map owned by mcp-manager.ts. The DB column is just a string
// projection — see `projectStateToColumn` in state-machine.ts.

export type ConnectionState =
  | { kind: "pending" }
  | { kind: "connecting"; startedAt: number; attemptCount: number }
  | {
      kind: "connected";
      connectedAt: number;
      toolCount: number;
      promptCount: number;
      resourceCount: number;
    }
  | {
      kind: "needs_auth";
      reason: string;
      authUrl?: string;
      challengeReceivedAt: number;
    }
  | {
      kind: "failed";
      reason: string;
      lastAttemptAt: number;
      attemptCount: number;
      nextRetryAt?: number;
    }
  | { kind: "disabled"; disabledAt: number };

/**
 * Events the FSM consumes. The mcp-manager dispatches these as users
 * click buttons (connect_requested, disconnect_requested, etc.) and as
 * transports report results (connect_succeeded, connect_failed, etc.).
 */
export type ConnectionEvent =
  | { type: "connect_requested" }
  | {
      type: "connect_succeeded";
      toolCount: number;
      promptCount: number;
      resourceCount: number;
    }
  | { type: "connect_failed"; reason: string }
  | { type: "auth_required"; reason: string; authUrl?: string }
  | { type: "auth_provided" }
  | { type: "disconnect_requested" }
  | { type: "mid_session_disconnect"; reason: string }
  | { type: "disable_requested" }
  | { type: "enable_requested" };

/**
 * Errors thrown during connect/disconnect/callTool. Wrapped so the
 * caller can distinguish manager-level errors from arbitrary throws.
 */
export class McpError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "McpError";
  }
}

/**
 * Minimal JSON-RPC 2.0 request shape used by all transports.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
