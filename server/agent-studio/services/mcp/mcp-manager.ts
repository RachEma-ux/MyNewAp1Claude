/**
 * AI Agent Studio — MCP Manager
 *
 * Phase 7 of the Agent Studio remaining-phases plan. Top-level API for
 * managing live MCP server connections. Per-process in-memory map keyed
 * by `agsDraftMcpServers.id`.
 *
 * Lifecycle:
 *  - connectMcpServer(row): dispatches to the right transport, stores
 *    the live connection in the map, updates the row's status to
 *    "connected" (or "error" on failure)
 *  - disconnectMcpServer(serverId): closes the connection, removes it
 *    from the map, updates the row's status to "disconnected"
 *  - listConnectedTools(draftId): returns flattened tool inventory
 *    from all connected servers attached to the draft
 *  - callMcpTool(serverId, name, args): convenience for the agent loop
 *
 * The map is process-local — restarting the dev server forgets all
 * connections. The row's `status` column is the durable side; the
 * runs page reflects whatever the row says.
 *
 * Cleanup: on process exit we close every connection so MCP child
 * processes don't outlive the Studio.
 */

import * as repo from "../../repository";
import { McpError, type McpConnection, type McpTool } from "./types";
import { connectStdio } from "./transports/stdio";
import { connectHttp } from "./transports/http";
import { connectSse } from "./transports/sse";
import { connectSdk } from "./transports/sdk";
import { connectWebSocket } from "./transports/websocket";

const connections = new Map<number, McpConnection>();
let exitHandlerRegistered = false;

function registerExitHandler() {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;
  process.on("exit", () => {
    // Synchronous best-effort close — node's exit handler doesn't await
    for (const [, conn] of connections) {
      conn.close().catch(() => {
        /* ignore */
      });
    }
    connections.clear();
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ConnectMcpServerInput {
  serverId: number;
}

export async function connectMcpServer(
  input: ConnectMcpServerInput
): Promise<{
  serverId: number;
  status: "connected" | "error";
  toolCount: number;
  error?: string;
}> {
  registerExitHandler();
  // Double-connect → reuse existing
  if (connections.has(input.serverId)) {
    const existing = connections.get(input.serverId)!;
    return {
      serverId: input.serverId,
      status: "connected",
      toolCount: existing.tools.length,
    };
  }

  const row = await repo.getMcpServerById(input.serverId);
  if (!row) {
    throw new McpError("not_found", `MCP server ${input.serverId} not found`);
  }

  let conn: McpConnection;
  try {
    switch (row.transport) {
      case "stdio":
        if (!row.command) {
          throw new McpError("config", "stdio transport requires a command");
        }
        conn = await connectStdio({
          serverId: row.id,
          command: row.command,
          args: (row.args ?? []) as string[],
          env: (row.env ?? {}) as Record<string, string>,
        });
        break;
      case "http":
        if (!row.url) {
          throw new McpError("config", "http transport requires a url");
        }
        conn = await connectHttp({
          serverId: row.id,
          url: row.url,
        });
        break;
      case "sse":
        if (!row.url) {
          throw new McpError("config", "sse transport requires a url");
        }
        conn = await connectSse({
          serverId: row.id,
          url: row.url,
        });
        break;
      // Phase 15a: Real WebSocket transport (replaces the previous scaffold)
      case "websocket":
        if (!row.url) {
          throw new McpError("config", "websocket transport requires a url");
        }
        conn = await connectWebSocket({
          serverId: row.id,
          url: row.url,
        });
        break;
      case "sdk":
        // Phase 15c: real in-process registry. We pass row.command as
        // the registry lookup key (a small convention so we don't need
        // a new column). Examples: "studio.echo", "studio.knowledge".
        conn = await connectSdk({
          serverId: row.id,
          serverName: row.command ?? undefined,
        });
        break;
      default:
        throw new McpError(
          "unknown_transport",
          `Unknown transport: ${row.transport}`
        );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Persist the error state on the row so the UI shows it
    try {
      await repo.updateMcpServerStatus(row.id, "error");
    } catch {
      /* ignore */
    }
    return {
      serverId: input.serverId,
      status: "error",
      toolCount: 0,
      error: message,
    };
  }

  connections.set(input.serverId, conn);
  await repo.updateMcpServerStatus(row.id, "connected");
  return {
    serverId: input.serverId,
    status: "connected",
    toolCount: conn.tools.length,
  };
}

export async function disconnectMcpServer(
  serverId: number
): Promise<{ serverId: number; status: "disconnected" }> {
  const conn = connections.get(serverId);
  if (conn) {
    try {
      await conn.close();
    } catch {
      /* ignore */
    }
    connections.delete(serverId);
  }
  try {
    await repo.updateMcpServerStatus(serverId, "disconnected");
  } catch {
    /* ignore — row might be deleted */
  }
  return { serverId, status: "disconnected" };
}

/**
 * Flatten the tool inventory from all servers attached to a draft.
 * Used by the simulation engine to merge MCP tools with the draft's
 * static tool bindings before passing them to the live runtime.
 */
export async function listConnectedTools(
  draftId: number
): Promise<Array<McpTool & { serverId: number; serverName: string }>> {
  const servers = await repo.listMcpServers(draftId);
  const result: Array<McpTool & { serverId: number; serverName: string }> = [];
  for (const s of servers) {
    const conn = connections.get(s.id);
    if (!conn) continue;
    for (const tool of conn.tools) {
      result.push({
        ...tool,
        serverId: s.id,
        serverName: s.name,
      });
    }
  }
  return result;
}

/**
 * Phase 15e: MCP-as-skill bridge.
 *
 * Returns prompts exposed by connected MCP servers, formatted as
 * skill-shaped entries that the catalog skills merge can include with
 * source="mcp_prompt". This mirrors openclaude's `mcpSkillBuilders.ts`
 * pattern.
 *
 * Phase 15e ships the bridge plumbing only — actual `prompts/list`
 * RPC support is a per-transport extension that would need to land in
 * stdio.ts / http.ts / websocket.ts. Without that, this returns an
 * empty array. Once a transport populates `connection.prompts`, this
 * function flattens them automatically.
 */
export interface McpPromptEntry {
  serverId: number;
  serverName: string;
  promptName: string;
  description?: string;
  /** Argument schema as JSON Schema */
  argumentsSchema?: Record<string, unknown>;
}

export async function listConnectedPrompts(
  draftId: number
): Promise<McpPromptEntry[]> {
  const servers = await repo.listMcpServers(draftId);
  const result: McpPromptEntry[] = [];
  for (const s of servers) {
    const conn = connections.get(s.id);
    if (!conn) continue;
    // The McpConnection type may not have `prompts` yet — the field is
    // optional and transports can populate it during their
    // initialization. We read defensively.
    const prompts = (conn as any).prompts as
      | Array<{
          name: string;
          description?: string;
          arguments?: Record<string, unknown>;
        }>
      | undefined;
    if (!Array.isArray(prompts)) continue;
    for (const p of prompts) {
      result.push({
        serverId: s.id,
        serverName: s.name,
        promptName: p.name,
        description: p.description,
        argumentsSchema: p.arguments,
      });
    }
  }
  return result;
}

/**
 * Invoke a tool on a connected MCP server. Throws if the server isn't
 * connected or the tool isn't advertised.
 */
export async function callMcpTool(input: {
  serverId: number;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<unknown> {
  const conn = connections.get(input.serverId);
  if (!conn) {
    throw new McpError(
      "not_connected",
      `MCP server ${input.serverId} is not connected — connect it first`
    );
  }
  const advertised = conn.tools.find((t) => t.name === input.toolName);
  if (!advertised) {
    throw new McpError(
      "tool_not_found",
      `Tool ${input.toolName} not found on server ${input.serverId}`
    );
  }
  return conn.callTool(input.toolName, input.args);
}

/**
 * Snapshot the current connection state — useful for the runs page or
 * an admin dashboard. Returns one entry per connected server.
 */
export function listConnections(): Array<{
  serverId: number;
  transport: string;
  toolCount: number;
}> {
  return Array.from(connections.values()).map((c) => ({
    serverId: c.serverId,
    transport: c.transport,
    toolCount: c.tools.length,
  }));
}
