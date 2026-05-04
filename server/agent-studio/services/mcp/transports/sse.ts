/**
 * AI Agent Studio — MCP SSE transport (Phase 4.1 of the MCP hardening
 * plan; replaces the Phase 7 scaffold).
 *
 * SSE in MCP is a hybrid: outgoing JSON-RPC requests are sent as HTTP
 * POSTs, and incoming responses + server-initiated notifications arrive
 * as `text/event-stream` events on a long-lived GET. This transport
 * uses Node's built-in `fetch` with a streamed `ReadableStream` body
 * to consume the SSE channel — no `eventsource` package dependency.
 *
 * Protocol assumptions (matches MCP SSE servers in the wild):
 *   - The configured URL accepts BOTH:
 *       GET  → opens the SSE stream (server emits `data: {...}` events)
 *       POST → accepts a JSON-RPC envelope, returns 202 (no body)
 *   - The server emits a `data:` event for every JSON-RPC response and
 *     for any notification (notifications/initialized, etc.).
 *   - The first SSE `data:` event is treated as the handshake response
 *     to `initialize`; we wait for it before declaring the connection
 *     open.
 *
 * Lifecycle:
 *   1. Open the GET SSE stream (with optional Bearer header).
 *   2. POST `initialize` over the same URL.
 *   3. Wait for the SSE stream's first response with id matching the
 *      initialize id.
 *   4. POST `notifications/initialized` (fire-and-forget).
 *   5. POST + await `tools/list`, `prompts/list`, `resources/list`
 *      (all non-fatal).
 *
 * Cleanup: close() aborts the streaming GET so the underlying fetch
 * resolves and Node releases the socket. The mcp-manager's process.on
 * ('exit') handler also closes every active connection.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpConnection,
  McpOnCloseCallback,
  McpPrompt,
  McpResource,
  McpTool,
} from "../types";
import { McpError, McpAuthRequiredError } from "../types";

const PROTOCOL_VERSION = "2024-11-05";
const HANDSHAKE_TIMEOUT_MS = 15_000;
const TOOLS_LIST_TIMEOUT_MS = 5_000;
const POST_TIMEOUT_MS = 5_000;
// Same heartbeat policy as the http transport — Phase 2.4.
const HEARTBEAT_INTERVAL_MS = 60_000;
const HEARTBEAT_FAILURES_BEFORE_CLOSE = 3;

export interface SseConnectInput {
  serverId: number;
  url: string;
  headers?: Record<string, string>;
  /** MCP hardening Phase 2.1: optional Bearer token. */
  bearerToken?: string;
  /** MCP hardening Phase 1.1: dispatched on mid-session disconnect. */
  onClose?: McpOnCloseCallback;
}

export async function connectSse(input: SseConnectInput): Promise<McpConnection> {
  const baseHeaders: Record<string, string> = {
    accept: "text/event-stream",
    ...(input.headers ?? {}),
  };
  if (input.bearerToken) {
    baseHeaders.authorization = `Bearer ${input.bearerToken}`;
  }

  // ── Open the SSE stream ──
  const controller = new AbortController();
  let res: Response;
  try {
    res = await fetch(input.url, {
      method: "GET",
      headers: baseHeaders,
      signal: controller.signal,
    });
  } catch (e) {
    throw new McpError(
      "open_failed",
      `SSE GET failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) {
    const wwwAuth = res.headers.get("www-authenticate") ?? undefined;
    if (res.status === 401 || (res.status === 403 && wwwAuth)) {
      let authUrl: string | undefined;
      if (wwwAuth) {
        const m = wwwAuth.match(/(?:as_uri|authorization_uri)="([^"]+)"/i);
        if (m) authUrl = m[1];
      }
      throw new McpAuthRequiredError(
        `SSE GET rejected: HTTP ${res.status}${wwwAuth ? ` (${wwwAuth})` : ""}`,
        authUrl
      );
    }
    throw new McpError(
      "http_error",
      `SSE GET returned HTTP ${res.status} ${res.statusText}`
    );
  }
  if (!res.body) {
    throw new McpError("open_failed", "SSE response has no body");
  }

  // ── Per-RPC id → resolver registry ──
  let nextId = 1;
  let closed = false;
  let notifiedClose = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  const fireOnClose = (reason: string) => {
    if (notifiedClose) return;
    notifiedClose = true;
    try {
      input.onClose?.(reason);
    } catch {
      /* never let onClose crash the close path */
    }
  };

  // ── SSE parser (background task) ──
  // Parses `data: <line>\n\n` events from the stream. The MCP spec
  // doesn't require multi-line `data:` frames so we accept the simple
  // single-line form.
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  const dispatchFrame = (rawData: string) => {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(rawData);
    } catch {
      return; // ignore garbage frames (heartbeat comments, etc.)
    }
    if (typeof msg.id !== "number") return; // notification — ignore
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
  };
  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const eventBlock = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of eventBlock.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              dispatchFrame(trimmed.slice(5).trim());
            }
          }
        }
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      for (const [, handler] of pending) {
        handler.reject(new McpError("stream_closed", reason));
      }
      pending.clear();
      fireOnClose(`SSE stream error: ${reason}`);
    } finally {
      // Stream ended cleanly — server closed the connection
      if (!closed) {
        for (const [, handler] of pending) {
          handler.reject(new McpError("stream_closed", "SSE stream ended"));
        }
        pending.clear();
        fireOnClose("SSE stream ended");
      }
    }
  })();

  // ── Outgoing POST helper ──
  const postRpc = async <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs: number = TOOLS_LIST_TIMEOUT_MS
  ): Promise<T> => {
    if (closed) {
      throw new McpError("closed", "SSE connection closed");
    }
    const id = nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>(async (resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new McpError("timeout", `${method} timed out after ${timeoutMs}ms`)
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
        const postRes = await fetch(input.url, {
          method: "POST",
          headers: {
            ...baseHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(POST_TIMEOUT_MS),
        });
        if (!postRes.ok && postRes.status !== 202) {
          // 200/202 are both acceptable per MCP SSE conventions; anything
          // else means the request was rejected outright.
          clearTimeout(timer);
          pending.delete(id);
          reject(
            new McpError(
              "http_error",
              `POST ${method} returned HTTP ${postRes.status}`
            )
          );
        }
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(
          new McpError(
            "post_failed",
            e instanceof Error ? e.message : String(e)
          )
        );
      }
    });
  };

  const postNotification = (method: string, params?: Record<string, unknown>) => {
    void fetch(input.url, {
      method: "POST",
      headers: { ...baseHeaders, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    }).catch(() => {
      /* fire-and-forget */
    });
  };

  // ── Handshake ──
  try {
    await postRpc(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: "agent-studio", version: "0.1.0" },
      },
      HANDSHAKE_TIMEOUT_MS
    );
  } catch (e) {
    closed = true;
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
    throw e;
  }
  postNotification("notifications/initialized");

  // ── Discover tools / prompts / resources ──
  let tools: McpTool[] = [];
  try {
    const r = await postRpc<{ tools?: McpTool[] }>("tools/list");
    if (r && Array.isArray(r.tools)) tools = r.tools;
  } catch {
    tools = [];
  }
  let prompts: McpPrompt[] = [];
  try {
    const r = await postRpc<{ prompts?: McpPrompt[] }>("prompts/list");
    if (r && Array.isArray(r.prompts)) prompts = r.prompts;
  } catch {
    prompts = [];
  }
  let resources: McpResource[] = [];
  try {
    const r = await postRpc<{ resources?: McpResource[] }>("resources/list");
    if (r && Array.isArray(r.resources)) resources = r.resources;
  } catch {
    resources = [];
  }

  // ── Heartbeat (Phase 2.4) ──
  let heartbeatFails = 0;
  const heartbeat = setInterval(async () => {
    if (closed) return;
    try {
      await postRpc("tools/list");
      heartbeatFails = 0;
    } catch {
      heartbeatFails++;
      if (heartbeatFails >= HEARTBEAT_FAILURES_BEFORE_CLOSE) {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
        fireOnClose(`heartbeat failed ${heartbeatFails} times in a row`);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  return {
    serverId: input.serverId,
    transport: "sse",
    tools,
    prompts,
    resources,
    close: async () => {
      closed = true;
      clearInterval(heartbeat);
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return postRpc("tools/call", { name, arguments: args }, 30_000);
    },
    getPrompt: async (name: string, args?: Record<string, string>) => {
      return postRpc("prompts/get", { name, arguments: args ?? {} });
    },
    readResource: async (uri: string) => {
      return postRpc("resources/read", { uri });
    },
  };
}
