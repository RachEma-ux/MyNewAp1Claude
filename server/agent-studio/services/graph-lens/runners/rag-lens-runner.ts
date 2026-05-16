/**
 * RAG lens runner — fifth real `LensRunnerFn` (T-F.66).
 *
 * Surfaces the "Retrieval-Augmented Generation surface — what
 * knowledge sources answer this question" view promised by
 * `GRAPH_LENS_KIND_METADATA.rag` over `agsRacSources` (the RAC
 * source registry).
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="rag_source"` — one per `agsRacSources` row.
 *         Meta carries `sourceType`, `ownerModule`, `externalRefId`,
 *         `enabled`, `priority`, embedding binding.
 *       * `typeKey="rag_profile"` — synthesized per distinct
 *         `profileId` so the lens shows which sources cluster
 *         under which RAC profile.
 *   - Edges:
 *       * `typeKey="belongs_to_profile"` — rag_source → rag_profile.
 *
 * Permission post-filter mirrors the other recent lenses
 * (visible iff `viewer.userId != null`).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `RagLensReadFn`.
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

export interface RagLensSourceRow {
  readonly id: number;
  readonly workspaceId: number;
  readonly profileId: number;
  readonly sourceType: string;
  readonly ownerModule: string;
  readonly externalRefId: string | null;
  readonly displayName: string | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly embeddingModelRef: string | null;
  readonly embeddingModelDim: number | null;
  readonly createdAt: Date;
}

export interface RagLensReadResult {
  readonly sources: ReadonlyArray<RagLensSourceRow>;
  readonly truncated: boolean;
}

export interface RagLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type RagLensReadFn = (
  params: RagLensReadParams,
) => Promise<RagLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const RAG_LENS_DEFAULT_LIMIT = 100;
export const RAG_LENS_ABSOLUTE_LIMIT = 500;

export function clampRagLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return RAG_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return RAG_LENS_DEFAULT_LIMIT;
  if (n > RAG_LENS_ABSOLUTE_LIMIT) return RAG_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isRagNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildRagLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: RagLensReadResult;
  readonly now: Date;
}

const SOURCE_NODE_PREFIX = "source:";
const PROFILE_NODE_PREFIX = "profile:";

export function buildRagLensSnapshot(
  input: BuildRagLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isRagNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const profileIdSet = new Set<number>();
  for (const s of read.sources) profileIdSet.add(s.profileId);

  for (const profileId of profileIdSet) {
    const id = `${PROFILE_NODE_PREFIX}${profileId}`;
    if (visible) {
      nodes.push({
        typeKey: "rag_profile",
        id,
        visible: true,
        label: `profile ${profileId}`,
        meta: { profileId },
      });
    } else {
      nodes.push({ typeKey: "rag_profile", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const s of read.sources) {
    const id = `${SOURCE_NODE_PREFIX}${s.id}`;
    if (visible) {
      nodes.push({
        typeKey: "rag_source",
        id,
        visible: true,
        label: s.displayName ?? `${s.sourceType} #${s.id}`,
        meta: {
          sourceId: s.id,
          workspaceId: s.workspaceId,
          profileId: s.profileId,
          sourceType: s.sourceType,
          ownerModule: s.ownerModule,
          externalRefId: s.externalRefId,
          displayName: s.displayName,
          enabled: s.enabled,
          priority: s.priority,
          embeddingModelRef: s.embeddingModelRef,
          embeddingModelDim: s.embeddingModelDim,
          createdAt: s.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "rag_source", id, visible: false });
      hiddenNodeCount += 1;
    }

    edges.push({
      typeKey: "belongs_to_profile",
      sourceNodeId: id,
      targetNodeId: `${PROFILE_NODE_PREFIX}${s.profileId}`,
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

export interface CreateRagLensRunnerDeps {
  readonly read: RagLensReadFn;
  readonly now?: () => Date;
}

export function createRagLensRunner(deps: CreateRagLensRunnerDeps): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampRagLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildRagLensSnapshot({ def, viewer, read, now: now() });
  };
}
