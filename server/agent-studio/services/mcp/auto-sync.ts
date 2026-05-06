/**
 * MCP auto-sync — Follow-up A4.
 *
 * Wraps `syncToolKnowledge` (Phase 7) as a registry subscriber so the
 * `agsMcpToolKnowledge` mirror stays current as MCP servers (re)publish
 * their tool snapshots. The registry itself stays workspace-agnostic;
 * the resolver injected here translates the snapshot's `serverId`
 * (per-process integer) into the workspace + canonical-server-id +
 * knowledge-source-id triple `syncToolKnowledge` needs.
 *
 * Operators wire `installAutoSync` once at boot (or from an admin
 * action) — typically AFTER configuring at least one tool_knowledge
 * `agsRacSources` row per workspace. When the resolver returns null
 * for a given `serverId`, that publish is silently skipped (the
 * registry doesn't have workspace context yet, so this is the
 * opt-in path).
 */

import {
  subscribeSnapshots,
  type SnapshotListener,
} from "./registry";
import {
  syncToolKnowledge as defaultSyncToolKnowledge,
  type SyncToolKnowledgeResult,
} from "./tool-knowledge-sync";

export interface AutoSyncContext {
  workspaceId: number;
  /** Canonical MCP server id (matches agsMcpToolKnowledge.mcpServerId). */
  mcpServerId: string;
  /** Source row id in agsRacSources for `tool_knowledge` units. */
  knowledgeSourceId: number;
  /** Actor id recorded for provenance. */
  actorId: number;
}

/**
 * Resolver: given the registry's per-process `serverId`, look up the
 * workspace + knowledge source needed by `syncToolKnowledge`. Returning
 * null skips the publish (no opt-in for this server yet).
 *
 * Implementations typically join `agsDraftMcpServers.id` to find the
 * draft, then resolve workspace + a `tool_knowledge` source row keyed
 * on workspaceId.
 */
export type AutoSyncContextResolver = (
  serverId: number,
) => Promise<AutoSyncContext | null> | AutoSyncContext | null;

export interface InstallAutoSyncOptions {
  resolveContext: AutoSyncContextResolver;
  /** Injectable for tests. */
  syncToolKnowledge?: typeof defaultSyncToolKnowledge;
  /** Optional callback fired after each successful sync (for tests / observability). */
  onSync?: (result: SyncToolKnowledgeResult) => void | Promise<void>;
  /** Optional callback fired on resolver / sync errors. */
  onError?: (err: unknown, serverId: number) => void;
}

/**
 * Subscribe an auto-sync listener to the registry. Returns an
 * unsubscribe function so boot code can tear down on shutdown.
 *
 * Best-effort everything: a resolver returning null skips the publish;
 * a resolver throwing fires `onError` and skips; a sync failure fires
 * `onError`. The connect flow is never blocked by sync errors — the
 * registry has already committed the snapshot before listeners run.
 */
export function installAutoSync(opts: InstallAutoSyncOptions): () => void {
  const sync = opts.syncToolKnowledge ?? defaultSyncToolKnowledge;
  const listener: SnapshotListener = async ({ current }) => {
    let ctx: AutoSyncContext | null;
    try {
      ctx = await Promise.resolve(opts.resolveContext(current.serverId));
    } catch (err) {
      opts.onError?.(err, current.serverId);
      return;
    }
    if (!ctx) return; // not opted in for this server
    try {
      const result = await sync({
        workspaceId: ctx.workspaceId,
        mcpServerId: ctx.mcpServerId,
        knowledgeSourceId: ctx.knowledgeSourceId,
        actorId: ctx.actorId,
        tools: current.tools as ReadonlyArray<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>,
      });
      if (opts.onSync) await opts.onSync(result);
    } catch (err) {
      opts.onError?.(err, current.serverId);
    }
  };
  return subscribeSnapshots(listener);
}
