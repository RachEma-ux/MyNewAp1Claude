/**
 * Code Intelligence lens runner — ninth `LensRunnerFn` (T-G.2.5).
 *
 * Surfaces the "Code graph — files / classes / functions / API
 * endpoints + import / call / declares relationships" view
 * promised by GRAPH_LENS_KIND_METADATA.code_intelligence over the
 * ags_code_graph_* tables (the T-G.2.3 persistence layer).
 *
 * Shape:
 *   - Nodes: pass-through of the closed-taxonomy code-graph
 *     typeKeys ("file", "class", "function", "method",
 *     "api_endpoint", etc.). Meta carries name, filePath,
 *     startLine, endLine.
 *   - Edges: pass-through of "imports", "calls", "declares" (+
 *     the other 7 production code-graph edge types as the
 *     ingestion grows). Cross-file unresolved targets (raw callee
 *     names, import specifiers) surface verbatim — operators see
 *     them as standalone nodes in the lens view.
 *
 * Permission post-filter: visible iff `viewer.userId != null`.
 * Code graphs are workspace_members scope per
 * install-default-lenses.ts.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No neo4j-driver / dispatchMcpToolCall / openrouter /
 *     credential-resolver imports.
 *   - No process.env.*_API_KEY reads.
 *   - DB I/O is injected via `CodeIntelligenceLensReadFn`.
 *   - Closed-taxonomy code-graph typeKeys propagate to the lens
 *     snapshot — no string conversion / re-mapping.
 */

import type { GraphLensDefinition } from "../contracts.js";
import type {
  LensRunnerFn,
  LensRunnerViewerContext,
  LensSnapshot,
  LensSnapshotEdge,
  LensSnapshotNode,
} from "../runner-contract.js";
import type {
  CodeIntelligenceLensReadFn,
  CodeIntelligenceLensReadResult,
} from "./code-intelligence-lens-asdb-reader.js";

// ============================================================================
// Defaults
// ============================================================================

export const CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT = 200;
export const CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT = 1000;

export function clampCodeIntelligenceLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) {
    return CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT;
  }
  const n = Math.floor(raw);
  if (n <= 0) return CODE_INTELLIGENCE_LENS_DEFAULT_LIMIT;
  if (n > CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT) {
    return CODE_INTELLIGENCE_LENS_ABSOLUTE_LIMIT;
  }
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isCodeIntelligenceNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildCodeIntelligenceLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: CodeIntelligenceLensReadResult;
  readonly now: Date;
}

export function buildCodeIntelligenceLensSnapshot(
  input: BuildCodeIntelligenceLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isCodeIntelligenceNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  // Synthetic ingestion node — gives operators a single entry point
  // to see "which ingestion is this view backed by" without a
  // separate UI panel. typeKey "code_graph_ingestion" intentionally
  // outside the production code-graph node taxonomy (the lens has
  // its own node taxonomy; this is a lens-internal anchor).
  if (read.ingestionId) {
    const ingestionLensId = `ingestion:${read.ingestionId}`;
    if (visible) {
      nodes.push({
        typeKey: "code_graph_ingestion",
        id: ingestionLensId,
        visible: true,
        label: read.repositoryId ?? read.ingestionId,
        meta: {
          ingestionId: read.ingestionId,
          repositoryId: read.repositoryId,
        },
      });
    } else {
      nodes.push({
        typeKey: "code_graph_ingestion",
        id: ingestionLensId,
        visible: false,
      });
      hiddenNodeCount += 1;
    }
  }

  for (const n of read.nodes) {
    if (visible) {
      nodes.push({
        typeKey: n.typeKey,
        id: n.id,
        visible: true,
        label: n.name,
        meta: {
          name: n.name,
          filePath: n.filePath,
          startLine: n.startLine,
          endLine: n.endLine,
          ...(n.properties ?? {}),
        },
      });
    } else {
      nodes.push({ typeKey: n.typeKey, id: n.id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const e of read.edges) {
    edges.push({
      typeKey: e.edgeTypeKey,
      sourceNodeId: e.sourceId,
      targetNodeId: e.targetId,
      visible: visible,
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

export interface CreateCodeIntelligenceLensRunnerDeps {
  readonly read: CodeIntelligenceLensReadFn;
  readonly now?: () => Date;
}

export function createCodeIntelligenceLensRunner(
  deps: CreateCodeIntelligenceLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampCodeIntelligenceLensLimit(viewer.limit);
    const read = await deps.read({ limit });
    return buildCodeIntelligenceLensSnapshot({
      def,
      viewer,
      read,
      now: now(),
    });
  };
}
