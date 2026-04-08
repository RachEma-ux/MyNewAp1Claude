/**
 * AI Agent Studio — MCP WebSocket transport
 *
 * Phase 15a: Speaks JSON-RPC 2.0 over a WebSocket frame, mirroring
 * the stdio transport's request/response model. Reuses the `ws`
 * package that's already installed for the Phase 1b openllm-agent2
 * runtime adapter — no new dependencies.
 *
 * Frame format: each WS message is a complete JSON-RPC envelope
 * (no chunking, no length-prefixing). The server pushes one message
 * per response.
 *
 * Lifecycle:
 *   1. Open the WebSocket connection
 *   2. Wait for "open" event (with timeout)
 *   3. Run the JSON-RPC handshake (initialize → notifications/initialized)
 *   4. Send tools/list to discover the tool inventory
 *   5. Return an McpConnection that routes tools/call through the same
 *      WS frame protocol
 *
 * Cleanup: close() closes the underlying WebSocket. The MCP manager's
 * process.on('exit') handler also closes every active connection.
 */

import WebSocket from "ws";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpConnection,
  McpTool,
} from "../types";
import { McpError } from "../types";

const PROTOCOL_VERSION = "2024-11-05";
const HANDSHAKE_TIMEOUT_MS = 10_000;
const TOOLS_LIST_TIMEOUT_MS = 5_000;
const OPEN_TIMEOUT_MS = 8_000;

export interface WebSocketConnectInput {
  serverId: number;
  url: string;
  headers?: Record<string, string>;
}

export async function connectWebSocket(
  input: WebSocketConnectInput
): Promise<McpConnection> {
  // Open the socket
  let ws: WebSocket;
  try {
    ws = new WebSocket(input.url, {
      headers: input.headers,
    });
  } catch (e) {
    throw new McpError(
      "open_failed",
      `Failed to open WebSocket: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Wait for open / fail-fast on error
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(
        new McpError(
          "open_timeout",
          `WebSocket open timed out after ${OPEN_TIMEOUT_MS}ms`
        )
      );
    }, OPEN_TIMEOUT_MS);

    const onOpen = () => {
      clearTimeout(timer);
      ws.removeListener("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timer);
      ws.removeListener("open", onOpen);
      reject(new McpError("open_error", err.message));
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
  });

  // Per-RPC id → resolver registry
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  let nextId = 1;
  let closed = false;

  // Route incoming frames to pending RPCs
  ws.on("message", (raw: Buffer | string) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf-8");
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(text);
    } catch {
      // Non-JSON frame — likely a heartbeat, ignore
      return;
    }
    if (typeof msg.id !== "number") return;
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);
    if (msg.error) {
      handler.reject(
        new McpError("rpc_error", `${msg.error.code}: ${msg.error.message}`)
      );
    } else {
      handler.resolve(msg.result);
    }
  });

  ws.on("close", () => {
    closed = true;
    for (const [, handler] of pending) {
      handler.reject(new McpError("connection_closed", "WebSocket closed"));
    }
    pending.clear();
  });

  ws.on("error", (err: Error) => {
    closed = true;
    for (const [, handler] of pending) {
      handler.reject(new McpError("connection_error", err.message));
    }
    pending.clear();
  });

  // Send an RPC and wait for response
  const sendRpc = <T = unknown>(
    method: string,
    params: Record<string, unknown> | undefined,
    timeoutMs: number
  ): Promise<T> => {
    if (closed || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new McpError("closed", "WebSocket connection is not open")
      );
    }
    const id = nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new McpError(
            "timeout",
            `${method} timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      try {
        ws.send(JSON.stringify(req));
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(
          new McpError(
            "send_failed",
            e instanceof Error ? e.message : String(e)
          )
        );
      }
    });
  };

  // Send a notification (no response expected)
  const sendNotification = (
    method: string,
    params?: Record<string, unknown>
  ) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
        })
      );
    } catch {
      /* ignore — connection may have died */
    }
  };

  // ── Handshake ──
  try {
    await sendRpc(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: "agent-studio", version: "0.1.0" },
      },
      HANDSHAKE_TIMEOUT_MS
    );
  } catch (e) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    throw e;
  }
  sendNotification("notifications/initialized");

  // ── Discover tools ──
  let tools: McpTool[] = [];
  try {
    const toolsResult = await sendRpc<{ tools?: McpTool[] }>(
      "tools/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (toolsResult && Array.isArray(toolsResult.tools)) {
      tools = toolsResult.tools;
    }
  } catch {
    // Non-fatal — server may not implement tools/list
    tools = [];
  }

  return {
    serverId: input.serverId,
    transport: "websocket",
    tools,
    close: async () => {
      closed = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return sendRpc("tools/call", { name, arguments: args }, 30_000);
    },
  };
}
