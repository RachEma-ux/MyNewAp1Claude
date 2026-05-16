/**
 * MCP lens runner — third real `LensRunnerFn` (T-F.64).
 *
 * Surfaces the "MCP tool dispatch graph" promised by
 * `GRAPH_LENS_KIND_METADATA.mcp` over `agsRuntimeToolCalls`. Each
 * row is a single dispatch through the single MCP chokepoint
 * (`dispatchMcpToolCall`); the lens lets operators see "which runs
 * called which tools, with what verdict" at a glance.
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="runtime_run"` — synthesized per distinct
 *         `runId` in the result set. Edge anchor for dispatch
 *         flows; visible iff viewer authenticated. (Matches the
 *         runtime lens runner's node typeKey so future cross-lens
 *         joins are straightforward.)
 *       * `typeKey="tool_call"` — one per `agsRuntimeToolCalls`
 *         row. Carries `toolKey` + `verdict` + `durationMs` meta.
 *       * `typeKey="tool"` — synthesized per distinct `toolKey`.
 *         No backing row; the lens shows the dispatch surface,
 *         not the tool registry.
 *   - Edges:
 *       * `typeKey="dispatched"` — `runtime_run` → `tool_call`.
 *       * `typeKey="target_tool"` — `tool_call` → `tool`.
 *
 * Permission post-filter mirrors the governance lens — visible iff
 * `viewer.userId != null`. Per-row tightening (e.g. only runs the
 * viewer triggered) is a future slice.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports. (The lens VIEWS the dispatcher
 *     trace; it does NOT invoke the dispatcher.)
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `McpLensReadFn`.
 */

import type {
  GraphLensDefinition,
} from "../contracts.js";
import type {
  LensRunnerFn,
  LensRunnerViewerContext,
  LensSnapshot,
  LensSnapshotEdge,
  LensSnapshotNode,
} from "../runner-contract.js";

// ============================================================================
// Read-seam shape
// ============================================================================

export interface McpLensToolCallRow {
  readonly id: number;
  readonly runId: number;
  readonly toolKey: string;
  readonly verdict: string | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
}

export interface McpLensReadResult {
  readonly toolCalls: ReadonlyArray<McpLensToolCallRow>;
  readonly truncated: boolean;
}

export interface McpLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type McpLensReadFn = (
  params: McpLensReadParams,
) => Promise<McpLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const MCP_LENS_DEFAULT_LIMIT = 100;
export const MCP_LENS_ABSOLUTE_LIMIT = 500;

export function clampMcpLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return MCP_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return MCP_LENS_DEFAULT_LIMIT;
  if (n > MCP_LENS_ABSOLUTE_LIMIT) return MCP_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isMcpNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildMcpLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: McpLensReadResult;
  readonly now: Date;
}

const RUN_NODE_PREFIX = "run:";
const CALL_NODE_PREFIX = "call:";
const TOOL_NODE_PREFIX = "tool:";

export function buildMcpLensSnapshot(
  input: BuildMcpLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isMcpNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const runIdSet = new Set<number>();
  const toolKeySet = new Set<string>();
  for (const c of read.toolCalls) {
    runIdSet.add(c.runId);
    toolKeySet.add(c.toolKey);
  }

  for (const runId of runIdSet) {
    const id = `${RUN_NODE_PREFIX}${runId}`;
    if (visible) {
      nodes.push({
        typeKey: "runtime_run",
        id,
        visible: true,
        label: `run #${runId}`,
        meta: { runId },
      });
    } else {
      nodes.push({ typeKey: "runtime_run", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const toolKey of toolKeySet) {
    const id = `${TOOL_NODE_PREFIX}${toolKey}`;
    if (visible) {
      nodes.push({
        typeKey: "tool",
        id,
        visible: true,
        label: toolKey,
        meta: { toolKey },
      });
    } else {
      nodes.push({ typeKey: "tool", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const c of read.toolCalls) {
    const callId = `${CALL_NODE_PREFIX}${c.id}`;
    if (visible) {
      nodes.push({
        typeKey: "tool_call",
        id: callId,
        visible: true,
        label: `${c.toolKey} ${c.verdict ?? "—"}`,
        meta: {
          toolCallId: c.id,
          runId: c.runId,
          toolKey: c.toolKey,
          verdict: c.verdict,
          durationMs: c.durationMs,
          createdAt: c.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "tool_call", id: callId, visible: false });
      hiddenNodeCount += 1;
    }

    edges.push({
      typeKey: "dispatched",
      sourceNodeId: `${RUN_NODE_PREFIX}${c.runId}`,
      targetNodeId: callId,
      visible: true,
    });
    edges.push({
      typeKey: "target_tool",
      sourceNodeId: callId,
      targetNodeId: `${TOOL_NODE_PREFIX}${c.toolKey}`,
      visible: true,
    });
  }

  return {
    lensId: def.id,
    kind: def.kind,
    layout: def.layout,
    producedAt: now,
    nodes,
    edges,
    hiddenNodeCount,
    truncated: read.truncated,
  };
}

// ============================================================================
// Runner factory
// ============================================================================

export interface CreateMcpLensRunnerDeps {
  readonly read: McpLensReadFn;
  readonly now?: () => Date;
}

export function createMcpLensRunner(deps: CreateMcpLensRunnerDeps): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampMcpLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildMcpLensSnapshot({ def, viewer, read, now: now() });
  };
}
