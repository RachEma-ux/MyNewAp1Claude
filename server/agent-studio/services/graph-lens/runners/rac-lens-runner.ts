/**
 * RAC lens runner — sixth real `LensRunnerFn` (T-F.67).
 *
 * Surfaces the "RAC — Retrieval + Assembly + Compilation — the
 * runtime context assembly view" promised by
 * `GRAPH_LENS_KIND_METADATA.rac` over `agsRacRuntimeTraces` (one
 * row per chat-stream trace). Each row records the RAC planner
 * mode + retrieval outcome + CAG pack binding for a single agent
 * turn.
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="rac_trace"` — one per `agsRacRuntimeTraces`
 *         row. Meta carries plannerMode / retrievalEnabled /
 *         chunks* / tokenBudget* / groundednessScore /
 *         fallbackReason / cagPackId.
 *       * `typeKey="rac_agent"` — synthesized per distinct
 *         `agentId`. Edge anchor for agent → traces.
 *       * `typeKey="rac_cag_pack"` — synthesized per distinct
 *         non-null `cagPackId`. Edge anchor for trace → pack so
 *         the lens crosses to the cag lens's `cag_pack` nodes
 *         (separate runner registry, but typeKey naming aligns).
 *   - Edges:
 *       * `typeKey="trace_for_agent"` — rac_trace → rac_agent.
 *       * `typeKey="uses_cag_pack"` — rac_trace → rac_cag_pack
 *         (only when `cagPackId` is non-null).
 *
 * Permission post-filter mirrors the other lenses (visible iff
 * `viewer.userId != null`).
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `RacLensReadFn`.
 */

import type { GraphLensDefinition } from "../contracts.js";
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

export interface RacLensTraceRow {
  readonly id: number;
  readonly workspaceId: number;
  readonly agentId: number;
  readonly mode: string;
  readonly plannerMode: string | null;
  readonly retrievalEnabled: boolean;
  readonly cagPackId: number | null;
  readonly chunksReturned: number;
  readonly chunksFiltered: number;
  readonly chunksIncluded: number;
  readonly tokenBudgetUsed: number | null;
  readonly groundednessScore: number | null;
  readonly fallbackReason: string | null;
  readonly createdAt: Date;
}

export interface RacLensReadResult {
  readonly traces: ReadonlyArray<RacLensTraceRow>;
  readonly truncated: boolean;
}

export interface RacLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type RacLensReadFn = (
  params: RacLensReadParams,
) => Promise<RacLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const RAC_LENS_DEFAULT_LIMIT = 100;
export const RAC_LENS_ABSOLUTE_LIMIT = 500;

export function clampRacLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return RAC_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return RAC_LENS_DEFAULT_LIMIT;
  if (n > RAC_LENS_ABSOLUTE_LIMIT) return RAC_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isRacNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildRacLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: RacLensReadResult;
  readonly now: Date;
}

const TRACE_NODE_PREFIX = "trace:";
const AGENT_NODE_PREFIX = "agent:";
const CAG_PACK_NODE_PREFIX = "pack:";

export function buildRacLensSnapshot(
  input: BuildRacLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isRacNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const agentIdSet = new Set<number>();
  const cagPackIdSet = new Set<number>();
  for (const t of read.traces) {
    agentIdSet.add(t.agentId);
    if (t.cagPackId != null) cagPackIdSet.add(t.cagPackId);
  }

  for (const agentId of agentIdSet) {
    const id = `${AGENT_NODE_PREFIX}${agentId}`;
    if (visible) {
      nodes.push({
        typeKey: "rac_agent",
        id,
        visible: true,
        label: `agent ${agentId}`,
        meta: { agentId },
      });
    } else {
      nodes.push({ typeKey: "rac_agent", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const cagPackId of cagPackIdSet) {
    const id = `${CAG_PACK_NODE_PREFIX}${cagPackId}`;
    if (visible) {
      nodes.push({
        typeKey: "rac_cag_pack",
        id,
        visible: true,
        label: `pack #${cagPackId}`,
        meta: { cagPackId },
      });
    } else {
      nodes.push({ typeKey: "rac_cag_pack", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const t of read.traces) {
    const id = `${TRACE_NODE_PREFIX}${t.id}`;
    if (visible) {
      nodes.push({
        typeKey: "rac_trace",
        id,
        visible: true,
        label: `trace #${t.id} — ${t.plannerMode ?? t.mode}`,
        meta: {
          traceId: t.id,
          workspaceId: t.workspaceId,
          agentId: t.agentId,
          mode: t.mode,
          plannerMode: t.plannerMode,
          retrievalEnabled: t.retrievalEnabled,
          cagPackId: t.cagPackId,
          chunksReturned: t.chunksReturned,
          chunksFiltered: t.chunksFiltered,
          chunksIncluded: t.chunksIncluded,
          tokenBudgetUsed: t.tokenBudgetUsed,
          groundednessScore: t.groundednessScore,
          fallbackReason: t.fallbackReason,
          createdAt: t.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "rac_trace", id, visible: false });
      hiddenNodeCount += 1;
    }

    edges.push({
      typeKey: "trace_for_agent",
      sourceNodeId: id,
      targetNodeId: `${AGENT_NODE_PREFIX}${t.agentId}`,
      visible: true,
    });

    if (t.cagPackId != null) {
      edges.push({
        typeKey: "uses_cag_pack",
        sourceNodeId: id,
        targetNodeId: `${CAG_PACK_NODE_PREFIX}${t.cagPackId}`,
        visible: true,
      });
    }
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

export interface CreateRacLensRunnerDeps {
  readonly read: RacLensReadFn;
  readonly now?: () => Date;
}

export function createRacLensRunner(deps: CreateRacLensRunnerDeps): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampRacLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildRacLensSnapshot({ def, viewer, read, now: now() });
  };
}
