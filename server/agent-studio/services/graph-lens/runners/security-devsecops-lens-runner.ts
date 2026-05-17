/**
 * Security / DevSecOps lens runner — 10th `LensRunnerFn` (T-G.3.5).
 *
 * Surfaces the "CVE → Package → Component → Service → Environment
 * → Owner → CustomerExposure impact graph" promised by
 * GRAPH_LENS_KIND_METADATA.security_devsecops over the
 * ags_security_graph_* tables (T-G.3.3).
 *
 * Permission gate (stronger than other lenses):
 *   Approver-only — visible iff viewer carries `approver` role
 *   OR `security` role. Security findings are not workspace-public;
 *   misuse of this lens leaks vulnerability state. The
 *   install-default-lenses.ts entry sets governanceScope to
 *   "approver_only" for the same reason.
 *
 * Shape:
 *   - Nodes pass through closed-taxonomy security-graph typeKeys
 *     (cve / security_finding / component / package / service /
 *     environment / owner / customer_exposure / policy / control).
 *   - Edges pass through closed-taxonomy edge typeKeys (8 types
 *     per T-G.3.1).
 *   - A synthetic `security_graph_ingestion` lens-node anchors
 *     the view (same pattern as code_intelligence's
 *     `code_graph_ingestion` anchor).
 *
 * Hard-rule compliance:
 *   - No neo4j-driver / dispatchMcpToolCall / openrouter /
 *     credential-resolver imports.
 *   - No process.env.*_API_KEY reads.
 *   - DB I/O injected via SecurityDevSecOpsLensReadFn.
 *   - Approver-only gate enforced INSIDE the visibility check
 *     (not just at the install-default-lenses governanceScope
 *     layer) so direct registry-level invocations still gate.
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
  SecurityDevSecOpsLensReadFn,
  SecurityDevSecOpsLensReadResult,
} from "./security-devsecops-lens-asdb-reader.js";

// ============================================================================
// Defaults
// ============================================================================

export const SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT = 100;
export const SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT = 500;

export function clampSecurityDevSecOpsLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) {
    return SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT;
  }
  const n = Math.floor(raw);
  if (n <= 0) return SECURITY_DEVSECOPS_LENS_DEFAULT_LIMIT;
  if (n > SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT) {
    return SECURITY_DEVSECOPS_LENS_ABSOLUTE_LIMIT;
  }
  return n;
}

// ============================================================================
// Permission gate — approver_only
// ============================================================================

/**
 * Approver-only: viewer must carry `approver`, `security`, OR
 * `admin` role. The role enum is workspace-scoped; the lens
 * runner doesn't enforce the underlying RBAC (that's the
 * graph-lens registry's job). This gate is a defense-in-depth
 * check so that even if the registry mis-routes a non-approver
 * call, the runner returns hidden-shape nodes.
 */
export function isSecurityDevSecOpsNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  if (viewer.userId == null) return false;
  const role = (viewer as { role?: string }).role;
  if (role === "admin" || role === "approver" || role === "security") {
    return true;
  }
  return false;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildSecurityDevSecOpsLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: SecurityDevSecOpsLensReadResult;
  readonly now: Date;
}

export function buildSecurityDevSecOpsLensSnapshot(
  input: BuildSecurityDevSecOpsLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isSecurityDevSecOpsNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  if (read.ingestionId) {
    const ingestionLensId = `ingestion:${read.ingestionId}`;
    if (visible) {
      nodes.push({
        typeKey: "security_graph_ingestion",
        id: ingestionLensId,
        visible: true,
        label: read.sourceKey ?? read.ingestionId,
        meta: {
          ingestionId: read.ingestionId,
          sourceKey: read.sourceKey,
        },
      });
    } else {
      nodes.push({
        typeKey: "security_graph_ingestion",
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
      visible,
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

export interface CreateSecurityDevSecOpsLensRunnerDeps {
  readonly read: SecurityDevSecOpsLensReadFn;
  readonly now?: () => Date;
}

export function createSecurityDevSecOpsLensRunner(
  deps: CreateSecurityDevSecOpsLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampSecurityDevSecOpsLensLimit(viewer.limit);
    const read = await deps.read({ limit });
    return buildSecurityDevSecOpsLensSnapshot({
      def,
      viewer,
      read,
      now: now(),
    });
  };
}
