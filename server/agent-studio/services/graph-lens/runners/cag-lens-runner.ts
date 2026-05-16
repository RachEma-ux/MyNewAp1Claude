/**
 * CAG lens runner — fourth real `LensRunnerFn` (T-F.65).
 *
 * Surfaces the "Capability Packs — compiled context blocks and
 * their provenance" view promised by
 * `GRAPH_LENS_KIND_METADATA.cag` over `agsCagCapabilityPacks`.
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="cag_pack"` — one per `agsCagCapabilityPacks`
 *         row. Meta carries pack lifecycle metadata (status, type,
 *         version, governance verdict, useCount, token estimates).
 *       * `typeKey="cag_agent"` — synthesized per distinct
 *         `agentId`. Edge anchor for ownership.
 *   - Edges:
 *       * `typeKey="owns"` — `cag_agent` → `cag_pack`.
 *
 * Permission post-filter mirrors the governance / mcp lenses
 * (visible iff `viewer.userId != null`). Per-row tightening can
 * scope by workspace membership later.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `CagLensReadFn`.
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

export interface CagLensPackRow {
  readonly id: number;
  readonly workspaceId: number;
  readonly agentId: number;
  readonly packType: string;
  readonly packVersion: number;
  readonly status: string;
  readonly tokenEstimate: number | null;
  readonly compileResult: string | null;
  readonly governanceVerdict: string | null;
  readonly useCount: number;
  readonly createdAt: Date;
}

export interface CagLensReadResult {
  readonly packs: ReadonlyArray<CagLensPackRow>;
  readonly truncated: boolean;
}

export interface CagLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type CagLensReadFn = (
  params: CagLensReadParams,
) => Promise<CagLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const CAG_LENS_DEFAULT_LIMIT = 100;
export const CAG_LENS_ABSOLUTE_LIMIT = 500;

export function clampCagLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return CAG_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return CAG_LENS_DEFAULT_LIMIT;
  if (n > CAG_LENS_ABSOLUTE_LIMIT) return CAG_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isCagNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildCagLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: CagLensReadResult;
  readonly now: Date;
}

const PACK_NODE_PREFIX = "pack:";
const AGENT_NODE_PREFIX = "agent:";

export function buildCagLensSnapshot(
  input: BuildCagLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isCagNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const agentIdSet = new Set<number>();
  for (const p of read.packs) {
    agentIdSet.add(p.agentId);
  }

  for (const agentId of agentIdSet) {
    const id = `${AGENT_NODE_PREFIX}${agentId}`;
    if (visible) {
      nodes.push({
        typeKey: "cag_agent",
        id,
        visible: true,
        label: `agent ${agentId}`,
        meta: { agentId },
      });
    } else {
      nodes.push({ typeKey: "cag_agent", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const p of read.packs) {
    const id = `${PACK_NODE_PREFIX}${p.id}`;
    if (visible) {
      nodes.push({
        typeKey: "cag_pack",
        id,
        visible: true,
        label: `pack #${p.id} v${p.packVersion} — ${p.status}`,
        meta: {
          packId: p.id,
          workspaceId: p.workspaceId,
          agentId: p.agentId,
          packType: p.packType,
          packVersion: p.packVersion,
          status: p.status,
          tokenEstimate: p.tokenEstimate,
          compileResult: p.compileResult,
          governanceVerdict: p.governanceVerdict,
          useCount: p.useCount,
          createdAt: p.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "cag_pack", id, visible: false });
      hiddenNodeCount += 1;
    }

    edges.push({
      typeKey: "owns",
      sourceNodeId: `${AGENT_NODE_PREFIX}${p.agentId}`,
      targetNodeId: id,
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

export interface CreateCagLensRunnerDeps {
  readonly read: CagLensReadFn;
  readonly now?: () => Date;
}

export function createCagLensRunner(deps: CreateCagLensRunnerDeps): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampCagLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildCagLensSnapshot({ def, viewer, read, now: now() });
  };
}
