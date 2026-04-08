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

// ── Phase 17e: auto-reconnect ──────────────────────────────────────────────

const RECONNECT_CHECK_INTERVAL_MS = 60_000;
const RECONNECT_MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 min cap
const reconnectAttempts = new Map<number, { count: number; nextAt: number }>();
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic reconnect checker. Walks every server row whose
 * status is "error" or "disconnected" and tries to reconnect them.
 * Idempotent — multiple calls are no-ops after the first.
 *
 * Backoff: per-server attempt counter; exponential up to 5 min.
 */
function ensureReconnectLoopStarted() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    try {
      // Walk every connected server row across all drafts
      // (the MCP manager is process-wide, not per-draft).
      const allRows = await repo.listAllMcpServers();
      const now = Date.now();
      for (const row of allRows) {
        // Skip rows we already have a connection for
        if (connections.has(row.id)) continue;
        // Skip rows in error state if we're in backoff
        const attempt = reconnectAttempts.get(row.id);
        if (attempt && now < attempt.nextAt) continue;
        // Only reconnect rows that were previously connected
        // (status === error means we tried before; pending = never tried)
        if (row.status !== "error") continue;
        // Try to reconnect
        try {
          await connectMcpServer({ serverId: row.id });
          reconnectAttempts.delete(row.id);
        } catch {
          // Bump backoff
          const next = attempt ? attempt.count + 1 : 1;
          const backoffMs = Math.min(
            1000 * Math.pow(2, next),
            RECONNECT_MAX_BACKOFF_MS
          );
          reconnectAttempts.set(row.id, {
            count: next,
            nextAt: now + backoffMs,
          });
        }
      }
    } catch {
      // Silent — the loop must keep running
    }
  }, RECONNECT_CHECK_INTERVAL_MS);
  if (reconnectTimer && typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
}

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
  ensureReconnectLoopStarted();
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
 * source="mcp_prompt". This mirrors the upstream `mcpSkillBuilders`
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
    // Phase 17b: prompts is now a required field on McpConnection
    // populated by stdio/http/websocket transports at connect time
    // (each calls prompts/list as part of the handshake).
    for (const p of conn.prompts) {
      result.push({
        serverId: s.id,
        serverName: s.name,
        promptName: p.name,
        description: p.description,
        argumentsSchema: p.arguments
          ? Object.fromEntries(
              p.arguments.map((a) => [a.name, a])
            )
          : undefined,
      });
    }
  }
  return result;
}

/**
 * Phase 17d: Resources advertised by connected MCP servers, flattened.
 * Used by the ListMcpResourcesTool implementation.
 */
export interface McpResourceEntry {
  serverId: number;
  serverName: string;
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export async function listConnectedResources(
  draftId: number
): Promise<McpResourceEntry[]> {
  const servers = await repo.listMcpServers(draftId);
  const result: McpResourceEntry[] = [];
  for (const s of servers) {
    const conn = connections.get(s.id);
    if (!conn) continue;
    for (const r of conn.resources) {
      result.push({
        serverId: s.id,
        serverName: s.name,
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      });
    }
  }
  return result;
}

/**
 * Phase 17d: Read a resource by URI from a connected server.
 */
export async function readMcpResource(input: {
  serverId: number;
  uri: string;
}): Promise<unknown> {
  const conn = connections.get(input.serverId);
  if (!conn) {
    throw new McpError(
      "not_connected",
      `MCP server ${input.serverId} is not connected`
    );
  }
  if (!conn.readResource) {
    throw new McpError(
      "not_supported",
      `Transport ${conn.transport} does not implement readResource`
    );
  }
  return conn.readResource(input.uri);
}

/**
 * Phase 17b: Invoke a prompt by name on a connected server.
 */
export async function invokeMcpPrompt(input: {
  serverId: number;
  promptName: string;
  args?: Record<string, string>;
}): Promise<unknown> {
  const conn = connections.get(input.serverId);
  if (!conn) {
    throw new McpError(
      "not_connected",
      `MCP server ${input.serverId} is not connected`
    );
  }
  if (!conn.getPrompt) {
    throw new McpError(
      "not_supported",
      `Transport ${conn.transport} does not implement getPrompt`
    );
  }
  return conn.getPrompt(input.promptName, input.args);
}

/**
 * Phase 19a: Get the live MCP connection for a server, or undefined if
 * not currently connected. Used by the dispatcher to invoke tools
 * directly without going through `callMcpTool` (which is now a shim
 * that delegates to the dispatcher — that would create a cycle).
 */
export function getMcpConnection(serverId: number): McpConnection | undefined {
  return connections.get(serverId);
}

/**
 * Invoke a tool on a connected MCP server.
 *
 * Phase 19a: This function is now a **5-line shim** that delegates to
 * the dispatcher (decision #2a — backward compat for any caller we
 * missed during the simulation.ts migration). New callers should use
 * `dispatchMcpToolCall` directly with the right `agentDraftId` and
 * `runtimeRunId` for proper governance + audit attribution.
 *
 * The shim uses `agentDraftId: -1` (SYSTEM_DRAFT_ID) which bypasses
 * the per-agent allowedTools check but STILL runs governance + writes
 * an audit row when a `runtimeRunId` is provided. This matches the
 * old "raw call" semantics while keeping every MCP invocation governed.
 *
 * The original throw-on-not-connected / throw-on-tool-not-found
 * behavior is preserved by re-throwing structured dispatcher errors as
 * `McpError` so legacy callers don't break.
 */
export async function callMcpTool(input: {
  serverId: number;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<unknown> {
  // Phase 19a shim — look up the server name so we can build the
  // dispatcher's `mcp__server__tool` key. The dispatcher will then
  // re-resolve back to the same serverId via the SYSTEM_DRAFT_ID path
  // (which scans listAllMcpServers). One DB roundtrip — acceptable
  // for the legacy shim path. New callers that already have the
  // full tool name should call dispatchMcpToolCall directly.
  //
  // The dispatcher import is lazy (dynamic) to break the circular
  // dependency: dispatcher.ts imports getMcpConnection from this file.
  const conn = connections.get(input.serverId);
  if (!conn) {
    throw new McpError(
      "not_connected",
      `MCP server ${input.serverId} is not connected — connect it first`
    );
  }
  const row = await repo.getMcpServerById(input.serverId);
  if (!row) {
    throw new McpError(
      "not_found",
      `MCP server ${input.serverId} row missing`
    );
  }
  const { dispatchMcpToolCall } = await import("./dispatcher");
  const result = await dispatchMcpToolCall({
    agentDraftId: -1, // SYSTEM_DRAFT_ID
    toolName: `mcp__${row.name}__${input.toolName}`,
    args: input.args,
    source: "manual_test",
  });
  if (!result.ok) {
    // Map dispatcher error codes back to McpError codes for backward compat
    const code = result.error?.code === "tool_not_found"
      ? "tool_not_found"
      : result.error?.code === "server_not_connected"
        ? "not_connected"
        : result.error?.code ?? "internal_error";
    throw new McpError(code, result.error?.message ?? "callMcpTool failed");
  }
  return result.result;
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
