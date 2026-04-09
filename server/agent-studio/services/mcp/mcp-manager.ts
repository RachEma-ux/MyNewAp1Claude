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
import {
  McpError,
  McpAuthRequiredError,
  type McpConnection,
  type McpTool,
  type ConnectionState,
  type ConnectionEvent,
} from "./types";
import { connectStdio } from "./transports/stdio";
import { connectHttp } from "./transports/http";
import { connectSse } from "./transports/sse";
import { connectSdk } from "./transports/sdk";
import { connectWebSocket } from "./transports/websocket";
import { applyTransition, projectStateToColumn } from "./state-machine";
import { emitTransition } from "./connection-events";
import * as registry from "./registry";

const connections = new Map<number, McpConnection>();
let exitHandlerRegistered = false;

// ── Phase 19b: in-memory FSM state map ─────────────────────────────────────
//
// The connection state machine lives in-process. Each serverId maps to a
// rich `ConnectionState` discriminated union. The `agsDraftMcpServers
// .status` column is a string projection (see projectStateToColumn).
//
// Source of truth: this map. The DB column is for UI / cross-process
// reads. After this commit, every status change goes through `applyEvent`
// instead of being scattered across connect/disconnect/reconnect handlers.
const states = new Map<number, ConnectionState>();

// ── Phase 17e: auto-reconnect ──────────────────────────────────────────────

const RECONNECT_CHECK_INTERVAL_MS = 60_000;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic reconnect checker. Walks every server row whose
 * status is "error" and tries to reconnect them, respecting the FSM
 * state's `nextRetryAt` backoff. Idempotent — multiple calls are
 * no-ops after the first.
 *
 * Phase 19b: backoff state lives in the FSM (`failed.attemptCount` +
 * `failed.nextRetryAt`), not in a separate `reconnectAttempts` map.
 * The pre-19b map has been deleted; the FSM is the single source of
 * truth for retry timing.
 *
 * Process restart: the FSM map is empty, so rows in `status="error"`
 * have no in-memory state. We treat them as fresh attempts and let
 * the next failure populate the FSM with proper backoff data.
 */
function ensureReconnectLoopStarted() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    try {
      // Walk every server row across all drafts (manager is process-wide).
      const allRows = await repo.listAllMcpServers();
      const now = Date.now();
      for (const row of allRows) {
        // Skip rows we already have a live connection for
        if (connections.has(row.id)) continue;
        // Only reconnect rows that were previously connected
        // (column "error" projects from FSM `failed`; "pending" means
        // never tried).
        if (row.status !== "error") continue;
        // FSM-aware backoff: if the in-memory state is `failed` and
        // `nextRetryAt` is in the future, skip this tick.
        const inMemState = states.get(row.id);
        if (
          inMemState?.kind === "failed" &&
          inMemState.nextRetryAt != null &&
          now < inMemState.nextRetryAt
        ) {
          continue;
        }
        // Try to reconnect — connectMcpServer drives the FSM transitions
        // and updates backoff data on failure automatically.
        try {
          await connectMcpServer({ serverId: row.id });
        } catch {
          // connectMcpServer already handled the FSM transition + persistence
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

// ── Phase 19b: FSM dispatch helper ─────────────────────────────────────────

/**
 * Apply a connection event to a server's FSM. Reads current state,
 * runs the transition, updates the in-memory map, persists the
 * projection to the DB column, and emits a transition event for
 * subscribers.
 *
 * Decision #6: illegal transitions throw in dev (catches FSM bugs)
 * and log + stay-at-current-state in prod (never crashes).
 *
 * Decision #9b: emitTransition fires async via setImmediate so a
 * slow listener can't block the FSM critical path.
 */
async function applyEvent(
  serverId: number,
  event: ConnectionEvent
): Promise<ConnectionState> {
  const current: ConnectionState = states.get(serverId) ?? { kind: "pending" };
  let next: ConnectionState;
  try {
    next = applyTransition(current, event);
  } catch (e) {
    // Dev-mode illegal transition — re-throw with context
    throw new Error(
      `MCP FSM error for server ${serverId}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  // Update in-memory state FIRST, then persist + emit. This guarantees
  // the in-memory map is always up-to-date even if the DB write fails.
  states.set(serverId, next);
  // Persist the column projection (best-effort — never fails the event)
  try {
    await repo.updateMcpServerStatus(serverId, projectStateToColumn(next));
  } catch {
    // Row might be deleted; ignore
  }
  // Async event emission (decision #9b)
  emitTransition({
    serverId,
    from: current,
    to: next,
    event,
    ts: Date.now(),
  });
  return next;
}

/**
 * Phase 19b: Read the current FSM state for a server. Returns the
 * default `{kind: "pending"}` for unknown serverIds. Used by the
 * tRPC `getServerState` query and tests.
 */
export function getConnectionState(serverId: number): ConnectionState {
  return states.get(serverId) ?? { kind: "pending" };
}

/**
 * Phase 19b: Snapshot all known FSM states. Used by the runs page
 * and admin dashboards. Returns one entry per serverId with state
 * in the in-memory map (excludes never-touched servers).
 */
export function getAllConnectionStates(): Array<{
  serverId: number;
  state: ConnectionState;
}> {
  return Array.from(states.entries()).map(([serverId, state]) => ({
    serverId,
    state,
  }));
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

  // Phase 19b: drive the FSM through `connect_requested`. The transition
  // moves us into `connecting`, which then resolves to either
  // `connected` (on success) or `failed` (on transport error).
  await applyEvent(input.serverId, { type: "connect_requested" });

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
    // Phase 19c: clean up any stale snapshot for this server before
    // we hand control back. A previous successful connect that later
    // failed mid-session would have left a snapshot behind; the new
    // failed attempt invalidates it.
    registry.removeServer(input.serverId);

    // ── Phase 19 follow-up: detect auth challenges ──
    //
    // If the transport threw `McpAuthRequiredError`, the server
    // returned an HTTP 401 / WWW-Authenticate / MCP auth_required
    // notification rather than a generic transport failure. Drive
    // the FSM into `needs_auth` so the UI can surface an OAuth
    // banner instead of bouncing the row through the failed-retry
    // backoff loop forever.
    if (e instanceof McpAuthRequiredError) {
      await applyEvent(input.serverId, {
        type: "auth_required",
        reason: e.reason,
        authUrl: e.authUrl,
      });
      return {
        serverId: input.serverId,
        status: "error",
        toolCount: 0,
        error: e.reason,
      };
    }

    // Phase 19b: drive the FSM through `connect_failed`. The transition
    // moves us from `connecting` to `failed` with backoff data
    // (attemptCount + nextRetryAt). The persistence projection writes
    // "error" to the column for backward compat with the auto-reconnect
    // loop. Decision #4b — soft fail, return the error to the caller.
    await applyEvent(input.serverId, {
      type: "connect_failed",
      reason: message,
    });
    return {
      serverId: input.serverId,
      status: "error",
      toolCount: 0,
      error: message,
    };
  }

  connections.set(input.serverId, conn);
  // Phase 19c: publish the discovery snapshot to the registry as the
  // LAST step of the connect flow (R7 mitigation — readers see a
  // non-undefined snapshot the moment connectMcpServer returns
  // success). The dispatcher and listConnectedTools/Prompts/Resources
  // read from the registry, not from `conn.tools` directly.
  registry.publishSnapshot({
    serverId: input.serverId,
    tools: conn.tools,
    prompts: conn.prompts,
    resources: conn.resources,
  });
  // Phase 19b: drive the FSM through `connect_succeeded`. Carries the
  // counts from the live connection so the UI banner can render
  // toolCount/promptCount/resourceCount without a separate fetch.
  await applyEvent(input.serverId, {
    type: "connect_succeeded",
    toolCount: conn.tools.length,
    promptCount: conn.prompts.length,
    resourceCount: conn.resources.length,
  });
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
  // Phase 19c: remove the server's snapshot from the registry. Decision
  // #7a — immediate removal, no grace period. In-flight calls don't
  // survive the disconnect anyway.
  registry.removeServer(serverId);
  // Phase 19b: drive the FSM through `disconnect_requested`. Maps to
  // `pending` (not `disabled` — disable is a separate user action).
  // The "disconnected" status string in the response is preserved for
  // backward compat with existing tRPC consumers, but the FSM state
  // and column projection are now `pending`.
  try {
    await applyEvent(serverId, { type: "disconnect_requested" });
  } catch {
    /* ignore — row might be deleted */
  }
  return { serverId, status: "disconnected" };
}

/**
 * Flatten the tool inventory from all servers attached to a draft.
 * Used by the simulation engine to merge MCP tools with the draft's
 * static tool bindings before passing them to the live runtime.
 *
 * Phase 19c: reads from the versioned registry instead of walking
 * `connections.get(...).tools` directly. The registry's snapshot is
 * frozen so callers can't see torn writes if a future republish is
 * mid-flight, and stale snapshots from disconnected servers are
 * already removed (decision #7a).
 */
export async function listConnectedTools(
  draftId: number
): Promise<Array<McpTool & { serverId: number; serverName: string }>> {
  const servers = await repo.listMcpServers(draftId);
  const result: Array<McpTool & { serverId: number; serverName: string }> = [];
  for (const s of servers) {
    const snap = registry.getSnapshot(s.id);
    if (!snap) continue;
    for (const tool of snap.tools) {
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
  // Phase 19c: reads from the versioned registry. Same rationale as
  // listConnectedTools — frozen snapshot, no torn reads.
  const servers = await repo.listMcpServers(draftId);
  const result: McpPromptEntry[] = [];
  for (const s of servers) {
    const snap = registry.getSnapshot(s.id);
    if (!snap) continue;
    for (const p of snap.prompts) {
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
  // Phase 19c: reads from the versioned registry.
  const servers = await repo.listMcpServers(draftId);
  const result: McpResourceEntry[] = [];
  for (const s of servers) {
    const snap = registry.getSnapshot(s.id);
    if (!snap) continue;
    for (const r of snap.resources) {
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
