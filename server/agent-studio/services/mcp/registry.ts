/**
 * AI Agent Studio — MCP Versioned Registry (Phase 19c)
 *
 * Snapshot-based discovery cache. Each connection publishes immutable
 * snapshots of its tools/prompts/resources with a monotonically
 * incrementing version counter. Readers (the dispatcher, the
 * listConnectedTools APIs) read from the registry instead of walking
 * `connections.values()` and reading mutable arrays directly.
 *
 * Why this matters:
 *   1. Cache invalidation correctness — readers can't see torn writes
 *      mid-update if a future tools/list_changed handler republishes
 *   2. Stable references — the dispatcher's tool lookup doesn't race
 *      with mid-session reconnects
 *   3. Hot-reload future-proofing — when MCP spec list_changed lands
 *      more broadly, only the transport's notification handler needs
 *      to call republishSnapshot()
 *   4. Cleaner shutdown — `removeServer` is one call, not "iterate
 *      every reader and notify"
 *
 * Decision #7a: snapshots are removed IMMEDIATELY on disconnect.
 * No grace period — in-flight calls don't survive a disconnect anyway.
 *
 * R7 mitigation: the manager calls `publishSnapshot` synchronously
 * as the LAST step of `connectMcpServer` before returning, so
 * `getSnapshot(serverId)` is always non-undefined immediately after
 * connect succeeds. The dispatcher relies on this.
 *
 * Process-local — same lifetime as the connections map in mcp-manager.
 */

import * as repo from "../../repository";
import type { McpTool, McpPrompt, McpResource } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RegistrySnapshot {
  serverId: number;
  /** Monotonic per-serverId, starts at 1 on first publish */
  version: number;
  publishedAt: number;
  tools: ReadonlyArray<McpTool>;
  prompts: ReadonlyArray<McpPrompt>;
  resources: ReadonlyArray<McpResource>;
}

export interface PublishSnapshotInput {
  serverId: number;
  tools: McpTool[];
  prompts: McpPrompt[];
  resources: McpResource[];
}

// ── Module state ───────────────────────────────────────────────────────────

const snapshots = new Map<number, RegistrySnapshot>();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Publish (or republish) a snapshot for a server. Increments the
 * version counter atomically. Caller's arrays are SHALLOW-COPIED
 * and frozen so the registry's view can never be mutated externally
 * (R7 — snapshot immutability).
 *
 * Per the plan §6 R7: this MUST be called as the last step of the
 * transport's connect flow, before connectMcpServer returns. Phase 19c
 * centralizes the call in mcp-manager.ts so all 5 transports inherit
 * the behavior without per-transport edits.
 */
export function publishSnapshot(input: PublishSnapshotInput): RegistrySnapshot {
  const previous = snapshots.get(input.serverId);
  const version = (previous?.version ?? 0) + 1;
  const snapshot: RegistrySnapshot = Object.freeze({
    serverId: input.serverId,
    version,
    publishedAt: Date.now(),
    tools: Object.freeze([...input.tools]),
    prompts: Object.freeze([...input.prompts]),
    resources: Object.freeze([...input.resources]),
  });
  snapshots.set(input.serverId, snapshot);
  return snapshot;
}

/**
 * Read the current snapshot for a server. Returns undefined when no
 * snapshot has been published (server never connected, or was
 * disconnected and removeServer cleaned up the entry).
 */
export function getSnapshot(serverId: number): RegistrySnapshot | undefined {
  return snapshots.get(serverId);
}

/**
 * Look up a tool by name on a specific server. Returns undefined when
 * the server has no snapshot OR when the tool isn't in the snapshot's
 * tools array.
 *
 * The dispatcher uses this instead of `conn.tools.find(...)` so the
 * lookup is consistent with whatever was published last (no torn
 * reads if a future republish is in flight).
 */
export function findToolForServer(
  serverId: number,
  toolName: string
): McpTool | undefined {
  const snap = snapshots.get(serverId);
  if (!snap) return undefined;
  return snap.tools.find((t) => t.name === toolName);
}

/**
 * Parse a global `mcp__server__tool` name and return the matching
 * tool + its serverId across the entire registry. Async because it
 * needs to resolve `serverName` → `serverId` via the DB (the
 * registry indexes by serverId, not name).
 *
 * R4 mitigation: strict 3-component parser (`mcp__SERVER__TOOL` where
 * SERVER may not contain `__`). Tool names CAN contain `__` (some MCP
 * servers do this).
 *
 * Note: the dispatcher today does this lookup itself with draft
 * scoping (via `repo.listMcpServers(draftId)`), which is more
 * efficient than scanning every server. This async global lookup is
 * provided for callers that don't have a draft context (admin tools,
 * future cross-draft operations).
 */
export async function findToolByGlobalNameAsync(
  globalName: string
): Promise<{ serverId: number; tool: McpTool } | undefined> {
  if (typeof globalName !== "string" || !globalName.startsWith("mcp__")) {
    return undefined;
  }
  const rest = globalName.slice("mcp__".length);
  const sepIdx = rest.indexOf("__");
  if (sepIdx <= 0) return undefined;
  const serverName = rest.slice(0, sepIdx);
  const remoteToolName = rest.slice(sepIdx + 2);
  if (remoteToolName.length === 0) return undefined;

  const allRows = await repo.listAllMcpServers();
  for (const row of allRows) {
    if (row.name !== serverName) continue;
    const snap = snapshots.get(row.id);
    if (!snap) continue;
    const tool = snap.tools.find((t) => t.name === remoteToolName);
    if (tool) return { serverId: row.id, tool };
  }
  return undefined;
}

/**
 * Remove a server's snapshot. Called by the manager on disconnect
 * (decision #7a — immediate removal, no grace period).
 */
export function removeServer(serverId: number): void {
  snapshots.delete(serverId);
}

/**
 * List snapshots for every MCP server attached to a draft. Used by
 * mcp-manager.listConnectedTools/Prompts/Resources. Filters via
 * repo.listMcpServers so cross-draft snapshots aren't leaked.
 */
export async function listSnapshotsForDraft(
  draftId: number
): Promise<ReadonlyArray<RegistrySnapshot>> {
  const draftServers = await repo.listMcpServers(draftId);
  const result: RegistrySnapshot[] = [];
  for (const s of draftServers) {
    const snap = snapshots.get(s.id);
    if (snap) result.push(snap);
  }
  return result;
}

/**
 * Snapshot count — for tests and admin dashboards.
 */
export function snapshotCount(): number {
  return snapshots.size;
}

/**
 * For testing only — clear all snapshots between tests.
 */
export function __clearAllSnapshotsForTests(): void {
  snapshots.clear();
}
