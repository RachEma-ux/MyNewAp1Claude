/**
 * AI Agent Studio — MCP SDK (in-process) transport
 *
 * Phase 15c: Replaces the Phase 7 scaffold with a real in-process
 * registry. Studio-native MCP "servers" can register themselves at
 * boot time via `registerSdkMcpServer()` and then any agsDraftMcpServers
 * row with transport="sdk" can refer to one of them by name.
 *
 * Use case: ship built-in MCP servers that wrap existing Studio
 * subsystems (e.g., the knowledge bindings, the tool catalog) without
 * spawning a separate process. Same connection contract as the other
 * transports — they all return McpConnection objects.
 *
 * Phase 15c ships ONE built-in SDK server as a demonstration:
 *   "studio.echo" — a trivial echo tool that returns its input. Useful
 *                   for testing the MCP wiring end-to-end without
 *                   needing an external server.
 *
 * Future built-ins (out of scope for Phase 15):
 *   "studio.knowledge"  — wraps agsDraftKnowledgeBindings as MCP tools
 *   "studio.runs"       — wraps the runtime trace tables
 *   "studio.governance" — exposes governance verdicts as a tool
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpConnection,
  McpOnCloseCallback,
  McpTool,
} from "../types";
import { McpError } from "../types";

// ── In-process server registry ──────────────────────────────────────────────

/**
 * Shape every in-process MCP server must implement. This is the same
 * abstraction the JSON-RPC pipeline expects from external transports —
 * if your handler can answer initialize / tools/list / tools/call, you
 * can plug it in here.
 */
export interface SdkMcpServer {
  name: string;
  description?: string;
  /** Tools advertised at handshake time */
  tools: McpTool[];
  /**
   * Execute a tool call. Throws to surface errors as JSON-RPC error
   * responses to the client.
   */
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

const sdkRegistry = new Map<string, SdkMcpServer>();

/**
 * Register an in-process server. Idempotent on `name` — re-registering
 * with the same name replaces the previous handler. Call from boot.ts
 * if you want a server available for the entire process lifetime.
 */
export function registerSdkMcpServer(server: SdkMcpServer): void {
  sdkRegistry.set(server.name, server);
}

export function listSdkMcpServers(): SdkMcpServer[] {
  return Array.from(sdkRegistry.values());
}

// ── Built-in: studio.echo ──────────────────────────────────────────────────

/**
 * A trivial "echo back the input" server that ships with Phase 15c.
 * Lets users smoke-test the MCP wiring without needing an external
 * MCP server binary. Auto-registered at module load.
 */
const STUDIO_ECHO_SERVER: SdkMcpServer = {
  name: "studio.echo",
  description: "Built-in echo server for testing MCP wiring (Phase 15c)",
  tools: [
    {
      name: "echo",
      description: "Return the provided input verbatim",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to echo back" },
        },
        required: ["message"],
      },
    },
    {
      name: "ping",
      description: "Return 'pong' — useful for connectivity smoke tests",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
  async callTool(toolName, args) {
    if (toolName === "echo") {
      const message = args.message;
      if (typeof message !== "string") {
        throw new Error("echo: 'message' arg must be a string");
      }
      return { content: [{ type: "text", text: message }] };
    }
    if (toolName === "ping") {
      return { content: [{ type: "text", text: "pong" }] };
    }
    throw new Error(`unknown tool: ${toolName}`);
  },
};

registerSdkMcpServer(STUDIO_ECHO_SERVER);

// ── Connection adapter ─────────────────────────────────────────────────────

export interface SdkConnectInput {
  serverId: number;
  /**
   * Server name from the registry. If omitted, the manager looks for
   * `agsDraftMcpServers.command` to use as the server name (a small
   * convention so users don't need a new column).
   */
  serverName?: string;
  /**
   * MCP hardening Phase 1.1: accepted for symmetry with stateful
   * transports. SDK servers run in-process — they can't die
   * independently of the host process — so this callback is never
   * invoked. Future work could add per-SDK-server lifecycle hooks
   * that call it for graceful in-process teardown.
   */
  onClose?: McpOnCloseCallback;
}

/**
 * "Connect" to an in-process server by looking it up in the registry.
 * Returns an McpConnection that routes tool calls directly to the
 * server's callTool() — no IPC, no JSON serialization, no socket.
 */
export async function connectSdk(input: SdkConnectInput): Promise<McpConnection> {
  const name = input.serverName?.trim();
  if (!name) {
    throw new McpError(
      "config",
      "sdk transport requires the in-process server name in `command` " +
        "(e.g. command='studio.echo'). Available servers: " +
        listSdkMcpServers()
          .map((s) => s.name)
          .join(", ")
    );
  }
  const server = sdkRegistry.get(name);
  if (!server) {
    throw new McpError(
      "not_found",
      `sdk server "${name}" not registered. Available: ${listSdkMcpServers()
        .map((s) => s.name)
        .join(", ")}`
    );
  }

  return {
    serverId: input.serverId,
    transport: "sdk",
    tools: server.tools,
    // SDK servers can implement prompts + resources via their own
    // SdkMcpServer interface — for now studio.echo doesn't, so empty
    prompts: [],
    resources: [],
    close: async () => {
      // In-process — nothing to close. The registry stays alive for the
      // process lifetime. We could add per-connection cleanup hooks
      // later if a server needs them.
    },
    callTool: async (toolName, args) => {
      try {
        return await server.callTool(toolName, args);
      } catch (e) {
        throw new McpError(
          "tool_call_failed",
          e instanceof Error ? e.message : String(e)
        );
      }
    },
  };
}
