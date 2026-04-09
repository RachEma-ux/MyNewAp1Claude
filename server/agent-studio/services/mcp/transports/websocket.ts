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
  McpPrompt,
  McpResource,
  McpTool,
} from "../types";
import { McpError, McpAuthRequiredError } from "../types";

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
      ws.removeListener("unexpected-response", onUnexpectedResponse);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timer);
      ws.removeListener("open", onOpen);
      ws.removeListener("unexpected-response", onUnexpectedResponse);
      // The `ws` package surfaces auth challenges as "Unexpected server
      // response: 401" — fall through to McpError unless the
      // unexpected-response handler already rejected with the
      // McpAuthRequiredError variant.
      reject(new McpError("open_error", err.message));
    };
    // Phase 19 follow-up: the `ws` package emits `unexpected-response`
    // BEFORE `error` when the WebSocket upgrade gets a non-101 status.
    // This is the only place we can read the HTTP response status +
    // headers (including WWW-Authenticate), so we hook it to detect
    // auth challenges and emit McpAuthRequiredError instead of the
    // generic open_error. If we don't handle this event, the manager
    // would see a transient connect_failed and bounce the row through
    // the failed-retry backoff loop instead of flipping to needs_auth.
    const onUnexpectedResponse = (
      _req: unknown,
      res: { statusCode?: number; headers?: Record<string, string | string[] | undefined> }
    ) => {
      const status = res.statusCode ?? 0;
      const wwwAuthRaw = res.headers?.["www-authenticate"];
      const wwwAuth = Array.isArray(wwwAuthRaw) ? wwwAuthRaw[0] : wwwAuthRaw;
      if (status === 401 || (status === 403 && wwwAuth)) {
        clearTimeout(timer);
        ws.removeListener("open", onOpen);
        ws.removeListener("error", onError);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        let authUrl: string | undefined;
        if (wwwAuth) {
          const m = wwwAuth.match(/(?:as_uri|authorization_uri)="([^"]+)"/i);
          if (m) authUrl = m[1];
        }
        reject(
          new McpAuthRequiredError(
            `WebSocket upgrade rejected: HTTP ${status}${wwwAuth ? ` (${wwwAuth})` : ""}`,
            authUrl
          )
        );
      }
      // Other non-101 responses fall through to the `error` event handler
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
    ws.once("unexpected-response", onUnexpectedResponse);
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

  // Phase 17b/d: discover prompts + resources (non-fatal)
  let prompts: McpPrompt[] = [];
  try {
    const result = await sendRpc<{ prompts?: McpPrompt[] }>(
      "prompts/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (result && Array.isArray(result.prompts)) prompts = result.prompts;
  } catch {
    prompts = [];
  }
  let resources: McpResource[] = [];
  try {
    const result = await sendRpc<{ resources?: McpResource[] }>(
      "resources/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (result && Array.isArray(result.resources))
      resources = result.resources;
  } catch {
    resources = [];
  }

  return {
    serverId: input.serverId,
    transport: "websocket",
    tools,
    prompts,
    resources,
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
    getPrompt: async (name: string, args?: Record<string, string>) => {
      return sendRpc(
        "prompts/get",
        { name, arguments: args ?? {} },
        TOOLS_LIST_TIMEOUT_MS
      );
    },
    readResource: async (uri: string) => {
      return sendRpc("resources/read", { uri }, TOOLS_LIST_TIMEOUT_MS);
    },
  };
}
