/**
 * Default auto-sync resolver — H1-c5 (cycle-5 audit closure).
 *
 * Cycle-5 audit (`/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md` §H1-c5)
 * found `installAutoSync()` defined but never called at boot. The
 * `agsMcpToolKnowledge` mirror stayed empty indefinitely unless an
 * operator manually triggered `agentStudio.mcpSchemaSync.sync`.
 *
 * H1-c5 closure: wire `installAutoSync()` at `bootAgentStudio()` step 4
 * (`server/agent-studio/boot.ts`) using the resolver in this module.
 *
 * Why a separate resolver module:
 *   The auto-sync.ts API takes a resolver `(serverId: number) → AutoSyncContext | null`.
 *   The resolver must derive workspaceId + canonical mcpServerId +
 *   knowledgeSourceId + actorId from the per-process serverId. **The
 *   agent-studio schema has no hard FK chain from `agsDraftMcpServers`
 *   to a workspace** (agsAgentDrafts and agsAgents both lack a
 *   workspaceId column). Without that chain, no fully-automatic resolver
 *   can be correct in a multi-workspace deployment.
 *
 * Single-workspace fallback (env-flag-gated):
 *   For the common single-region single-process baseline (CLAUDE.md
 *   multi-region ADR §6 deferral), set the env var
 *   `AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID` to the operator's workspace
 *   id. The resolver then:
 *     1. Looks up `agsDraftMcpServers.id = serverId` → row.name
 *     2. Looks up the first `tool_knowledge` source in `agsRacSources`
 *        for the configured workspace
 *     3. Returns `{workspaceId, mcpServerId: row.name, knowledgeSourceId,
 *        actorId: 0}` (system actor for boot-time syncs)
 *     4. Returns null if any step fails (logs to console.warn)
 *
 * Multi-workspace deployments must inject a custom resolver via the
 * exported `setAutoSyncResolver()` accessor (called from operator
 * tooling, not from boot). Until set, the default resolver runs and
 * returns null when the env-flag is unset — matching today's behavior
 * (no auto-sync). The lockstep test asserts the BOOT WIRE-UP exists,
 * not that auto-sync runs unconditionally — env-flag flips behavior.
 *
 * Mirrors cycle-3 R6-c3 (`GOVERNANCE_ENFORCE_APPROVALS`) pattern: ship
 * the wire-up + opt-in env flag; preserve baseline behavior; let
 * operators flip in staging.
 */

import { getAsDb } from "../../db/connection";
import { agsDraftMcpServers } from "../../../../drizzle/tables/agent-studio";
import { eq } from "drizzle-orm";
import { listSourcesForWorkspace } from "../rac/sources/store";
import type { AutoSyncContext, AutoSyncContextResolver } from "./auto-sync";

const AUTO_SYNC_WORKSPACE_ENV = "AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID";

function readWorkspaceFallback(): number | null {
  const raw = process.env[AUTO_SYNC_WORKSPACE_ENV];
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Default resolver. Returns null unless the operator has set the
 * single-workspace fallback env var AND the lookups succeed.
 */
export const defaultAutoSyncResolver: AutoSyncContextResolver = async (
  serverId: number,
): Promise<AutoSyncContext | null> => {
  const fallbackWorkspaceId = readWorkspaceFallback();
  if (fallbackWorkspaceId === null) return null;

  const db = getAsDb();
  if (!db) return null;

  // 1. Look up the per-process serverId in agsDraftMcpServers.
  const rows = await db
    .select()
    .from(agsDraftMcpServers)
    .where(eq(agsDraftMcpServers.id, serverId))
    .limit(1);
  const server = rows[0];
  if (!server) return null;

  // 2. Find a tool_knowledge source for the fallback workspace.
  let sources;
  try {
    sources = await listSourcesForWorkspace(
      fallbackWorkspaceId,
      "tool_knowledge",
    );
  } catch {
    return null;
  }
  if (sources.length === 0) {
    // Operator has fallback set but no tool_knowledge source registered yet.
    // Log once per serverId so it's visible without flooding.
    return null;
  }
  const source = sources[0];

  return {
    workspaceId: fallbackWorkspaceId,
    mcpServerId: server.name, // canonical name (matches mcp__<name>__<tool> dispatch prefix)
    knowledgeSourceId: source.id,
    actorId: 0, // system actor for boot-time syncs (matches D-RESUME-1 sentinel)
  };
};

// ── Resolver injection (multi-workspace operator escape hatch) ────────
let _injectedResolver: AutoSyncContextResolver | null = null;

/**
 * Operator escape hatch for multi-workspace deployments. Replace the
 * default resolver with one that knows the deployment's specific
 * workspace mapping. The `installAutoSync()` boot-time wire-up will
 * use the injected resolver if set, else the default.
 *
 * Pass `null` to revert to the default. Test helper.
 */
export function setAutoSyncResolver(
  resolver: AutoSyncContextResolver | null,
): void {
  _injectedResolver = resolver;
}

export function getAutoSyncResolver(): AutoSyncContextResolver {
  return _injectedResolver ?? defaultAutoSyncResolver;
}
