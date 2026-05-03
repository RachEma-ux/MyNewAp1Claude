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
  McpOnCloseCallback,
  McpPrompt,
  McpResource,
  McpTool,
} from "../types";
import { McpError, McpAuthRequiredError } from "../types";

const PROTOCOL_VERSION = "2024-11-05";

export interface HttpConnectInput {
  serverId: number;
  url: string;
  headers?: Record<string, string>;
  /**
   * MCP hardening Phase 1.1: accepted for symmetry with stateful
   * transports. The HTTP transport is stateless (no long-lived
   * connection), so there's no underlying socket that can die
   * independently of an in-flight request — this callback is never
   * invoked. Phase 2.4's heartbeat will fire it on consecutive ping
   * failures.
   */
  onClose?: McpOnCloseCallback;
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
      // Phase 19 follow-up: detect auth challenges and throw the
      // distinct McpAuthRequiredError so the manager can drive the
      // FSM into `needs_auth` instead of `failed`. Triggers on:
      //  - HTTP 401 Unauthorized
      //  - HTTP 403 Forbidden + WWW-Authenticate header
      //    (some MCP servers respond with 403 when scope is wrong)
      const wwwAuth = res.headers.get("www-authenticate") ?? undefined;
      if (res.status === 401 || (res.status === 403 && wwwAuth)) {
        // Best-effort extract of an OAuth start URL from the
        // WWW-Authenticate header (Bearer realm="...", as_uri="...")
        let authUrl: string | undefined;
        if (wwwAuth) {
          const m = wwwAuth.match(/(?:as_uri|authorization_uri)="([^"]+)"/i);
          if (m) authUrl = m[1];
        }
        throw new McpAuthRequiredError(
          `HTTP ${res.status} ${res.statusText}${wwwAuth ? ` (${wwwAuth})` : ""}`,
          authUrl
        );
      }
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

  // Phase 17b/d: discover prompts + resources (non-fatal)
  let prompts: McpPrompt[] = [];
  try {
    const result = await sendRpc<{ prompts?: McpPrompt[] }>("prompts/list");
    if (result && Array.isArray(result.prompts)) prompts = result.prompts;
  } catch {
    prompts = [];
  }
  let resources: McpResource[] = [];
  try {
    const result = await sendRpc<{ resources?: McpResource[] }>(
      "resources/list"
    );
    if (result && Array.isArray(result.resources))
      resources = result.resources;
  } catch {
    resources = [];
  }

  return {
    serverId: input.serverId,
    transport: "http",
    tools,
    prompts,
    resources,
    close: async () => {
      // Stateless — nothing to close
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return sendRpc("tools/call", { name, arguments: args });
    },
    getPrompt: async (name: string, args?: Record<string, string>) => {
      return sendRpc("prompts/get", { name, arguments: args ?? {} });
    },
    readResource: async (uri: string) => {
      return sendRpc("resources/read", { uri });
    },
  };
}
