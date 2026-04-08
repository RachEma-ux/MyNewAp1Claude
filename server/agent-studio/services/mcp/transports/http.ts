/**
 * AI Agent Studio — MCP HTTP transport
 *
 * Phase 7. Speaks JSON-RPC 2.0 over HTTP POST. Each RPC is a single
 * fetch — there's no long-lived connection. tools/call is also POST.
 *
 * Cleaner than SSE for stateless servers; the trade-off is no server-
 * initiated messages (the agent loop only ever speaks first anyway).
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpConnection,
  McpTool,
} from "../types";
import { McpError } from "../types";

const PROTOCOL_VERSION = "2024-11-05";

export interface HttpConnectInput {
  serverId: number;
  url: string;
  headers?: Record<string, string>;
}

export async function connectHttp(
  input: HttpConnectInput
): Promise<McpConnection> {
  let nextId = 1;
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(input.headers ?? {}),
  };

  const sendRpc = async <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> => {
    const id = nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    let res: Response;
    try {
      res = await fetch(input.url, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(req),
      });
    } catch (e) {
      throw new McpError(
        "fetch_failed",
        e instanceof Error ? e.message : String(e)
      );
    }
    if (!res.ok) {
      throw new McpError(
        "http_error",
        `HTTP ${res.status} ${res.statusText}`
      );
    }
    let body: JsonRpcResponse;
    try {
      body = (await res.json()) as JsonRpcResponse;
    } catch (e) {
      throw new McpError(
        "parse_failed",
        e instanceof Error ? e.message : String(e)
      );
    }
    if (body.error) {
      throw new McpError(
        "rpc_error",
        `${body.error.code}: ${body.error.message}`
      );
    }
    return body.result as T;
  };

  // Handshake
  await sendRpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {} },
    clientInfo: { name: "agent-studio", version: "0.1.0" },
  });
  // Initialized notification — fire-and-forget
  void fetch(input.url, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  }).catch(() => {
    /* ignore */
  });

  // Discover tools
  let tools: McpTool[] = [];
  try {
    const result = await sendRpc<{ tools?: McpTool[] }>("tools/list");
    if (result && Array.isArray(result.tools)) tools = result.tools;
  } catch {
    tools = [];
  }

  return {
    serverId: input.serverId,
    transport: "http",
    tools,
    close: async () => {
      // Stateless — nothing to close
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return sendRpc("tools/call", { name, arguments: args });
    },
  };
}
