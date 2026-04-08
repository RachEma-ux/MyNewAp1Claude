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
 * A live MCP connection. Each transport produces one of these. The
 * manager stores them in an in-memory map keyed by serverId.
 */
export interface McpConnection {
  /** The agsDraftMcpServers row id */
  serverId: number;
  /** Transport name: stdio | sse | http | sdk */
  transport: string;
  /** The tools the server advertised on initialize */
  tools: McpTool[];
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
}

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
