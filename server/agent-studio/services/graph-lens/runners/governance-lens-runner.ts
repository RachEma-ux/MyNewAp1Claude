/**
 * Governance lens runner — second real `LensRunnerFn` (T-F.63).
 *
 * Surfaces the "Approval, permission, and policy graph" promised by
 * `GRAPH_LENS_KIND_METADATA.governance` over `agsPublishRequests` +
 * `agsApprovalSteps`. Applies precedent (l) steps (1) + (2) for
 * `kind="governance"`; the tRPC layer (T-F.61) + UI page (T-F.62)
 * already accept any registered runner, so this slice ships the
 * runner + ASDB adapter in a single PR.
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="publish_request"` for each publishRequest row.
 *       * `typeKey="approval_step"` for each approvalStep row.
 *       * `typeKey="approver"` for each distinct user id appearing as
 *         `decidedBy` on any step row (synthesized — there is no
 *         dedicated row to read, so the runner derives them from the
 *         step rows).
 *   - Edges:
 *       * `typeKey="has_step"` — publishRequest → approvalStep.
 *       * `typeKey="decided_by"` — approvalStep → approver. Only
 *         emitted when the step row has a non-null `decidedBy`.
 *   - Permission post-filter: a node is `visible` iff the viewer has
 *     a userId at all (anonymous viewers see redacted nodes). Future
 *     tightening can scope to "requester or approver of this row"
 *     without changing the shape contract.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `GovernanceLensReadFn` so the pure
 *     builder is unit-testable without a live ASDB.
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
// Read-seam shape (caller-owned)
// ============================================================================

export interface GovernanceLensRequestRow {
  readonly id: number;
  readonly agentId: number;
  readonly state: string;
  readonly targetEnvironment: string;
  readonly requestedBy: number | null;
  readonly createdAt: Date;
}

export interface GovernanceLensStepRow {
  readonly id: number;
  readonly publishRequestId: number;
  readonly stepOrder: number;
  readonly approverRole: string;
  readonly state: string;
  readonly decidedBy: number | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
}

export interface GovernanceLensReadResult {
  readonly requests: ReadonlyArray<GovernanceLensRequestRow>;
  readonly steps: ReadonlyArray<GovernanceLensStepRow>;
  readonly truncated: boolean;
}

export interface GovernanceLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type GovernanceLensReadFn = (
  params: GovernanceLensReadParams,
) => Promise<GovernanceLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const GOVERNANCE_LENS_DEFAULT_LIMIT = 100;
export const GOVERNANCE_LENS_ABSOLUTE_LIMIT = 500;

export function clampGovernanceLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return GOVERNANCE_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return GOVERNANCE_LENS_DEFAULT_LIMIT;
  if (n > GOVERNANCE_LENS_ABSOLUTE_LIMIT) return GOVERNANCE_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate — pure
// ============================================================================

/**
 * Returns `true` iff the viewer is permitted to see this node's
 * label + meta. The current policy is "anonymous sees nothing,
 * authenticated sees all" — a deliberately permissive first slice.
 * Future tightening can scope to "requester or approver of this row"
 * via the row-specific overload below.
 */
export function isGovernanceNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildGovernanceLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: GovernanceLensReadResult;
  readonly now: Date;
}

const REQUEST_NODE_PREFIX = "req:";
const STEP_NODE_PREFIX = "step:";
const APPROVER_NODE_PREFIX = "user:";

export function buildGovernanceLensSnapshot(
  input: BuildGovernanceLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isGovernanceNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const requestIdSet = new Set<string>();
  for (const r of read.requests) {
    const id = `${REQUEST_NODE_PREFIX}${r.id}`;
    requestIdSet.add(id);
    if (visible) {
      nodes.push({
        typeKey: "publish_request",
        id,
        visible: true,
        label: `publish request #${r.id} — ${r.state}`,
        meta: {
          requestId: r.id,
          agentId: r.agentId,
          state: r.state,
          targetEnvironment: r.targetEnvironment,
          requestedBy: r.requestedBy,
          createdAt: r.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "publish_request", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  const approverIdSet = new Set<string>();
  for (const s of read.steps) {
    const id = `${STEP_NODE_PREFIX}${s.id}`;
    if (visible) {
      nodes.push({
        typeKey: "approval_step",
        id,
        visible: true,
        label: `step ${s.stepOrder} (${s.approverRole}) — ${s.state}`,
        meta: {
          stepId: s.id,
          publishRequestId: s.publishRequestId,
          stepOrder: s.stepOrder,
          approverRole: s.approverRole,
          state: s.state,
          decidedBy: s.decidedBy,
          decidedAt: s.decidedAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "approval_step", id, visible: false });
      hiddenNodeCount += 1;
    }

    // Edge: publishRequest → step (only if the parent request is in
    // the snapshot — orphans suppressed).
    const parentId = `${REQUEST_NODE_PREFIX}${s.publishRequestId}`;
    if (requestIdSet.has(parentId)) {
      edges.push({
        typeKey: "has_step",
        sourceNodeId: parentId,
        targetNodeId: id,
        visible: true,
      });
    }

    if (s.decidedBy != null) {
      const approverId = `${APPROVER_NODE_PREFIX}${s.decidedBy}`;
      approverIdSet.add(approverId);
      edges.push({
        typeKey: "decided_by",
        sourceNodeId: id,
        targetNodeId: approverId,
        visible: true,
      });
    }
  }

  // Synthesize approver nodes for every distinct decidedBy.
  for (const approverId of approverIdSet) {
    const userId = approverId.slice(APPROVER_NODE_PREFIX.length);
    if (visible) {
      nodes.push({
        typeKey: "approver",
        id: approverId,
        visible: true,
        label: `user ${userId}`,
        meta: { userId: Number(userId) },
      });
    } else {
      nodes.push({ typeKey: "approver", id: approverId, visible: false });
      hiddenNodeCount += 1;
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

export interface CreateGovernanceLensRunnerDeps {
  readonly read: GovernanceLensReadFn;
  readonly now?: () => Date;
}

export function createGovernanceLensRunner(
  deps: CreateGovernanceLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampGovernanceLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildGovernanceLensSnapshot({ def, viewer, read, now: now() });
  };
}
