/**
 * Institutional Memory lens runner — eighth + final real
 * `LensRunnerFn` (T-F.69).
 *
 * Surfaces the "People / teams / decisions / policies — the
 * organizational graph" view promised by
 * `GRAPH_LENS_KIND_METADATA.institutional_memory` over `agsAgents`
 * (which carries owner + domain — the closest ASDB-resident
 * approximation of "who owns what, and what cluster does it belong
 * to").
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="inst_agent"` — one per `agsAgents` row. Meta
 *         carries name / internalKey / domain / ownerId /
 *         visibility / lifecycleState / agentClass.
 *       * `typeKey="inst_owner"` — synthesized per distinct non-null
 *         `ownerId`.
 *       * `typeKey="inst_domain"` — synthesized per distinct
 *         non-null `domain`.
 *   - Edges:
 *       * `typeKey="owned_by"` — inst_agent → inst_owner (only when
 *         `ownerId` is non-null).
 *       * `typeKey="belongs_to_domain"` — inst_agent → inst_domain
 *         (only when `domain` is non-null).
 *
 * Permission post-filter: visible iff `viewer.userId != null`.
 *
 * Mapping caveat
 *   The institutional-memory metadata mentions "people / teams /
 *   decisions / policies"; this first slice maps that to the closest
 *   ASDB-resident shape (agents + owners + domains). A full "people
 *   directory + team graph + decision log + policy registry" view
 *   would cross to the main DB (`users` + `workspaces` + audit
 *   tables) and is the natural follow-up — same shape contract,
 *   different read seam.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `InstitutionalMemoryLensReadFn`.
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

export interface InstitutionalMemoryLensAgentRow {
  readonly id: number;
  readonly name: string;
  readonly internalKey: string;
  readonly ownerId: number | null;
  readonly domain: string | null;
  readonly visibility: string | null;
  readonly lifecycleState: string;
  readonly agentClass: string | null;
  readonly createdAt: Date;
}

/**
 * Workflow row — first projector-backed institutional memory node
 * type beyond the legacy agent/owner/domain trio. Emits `inst_workflow`
 * typeKey nodes mapped from the existing `workflows` table per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.workflow`.
 */
export interface InstitutionalMemoryLensWorkflowRow {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
}

export interface InstitutionalMemoryLensReadResult {
  readonly agents: ReadonlyArray<InstitutionalMemoryLensAgentRow>;
  /** Optional — defaults to `[]` for callers that haven't migrated to the
   * projector-backed shape. New typeKey-aligned reads land additively. */
  readonly workflows?: ReadonlyArray<InstitutionalMemoryLensWorkflowRow>;
  readonly truncated: boolean;
}

export interface InstitutionalMemoryLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type InstitutionalMemoryLensReadFn = (
  params: InstitutionalMemoryLensReadParams,
) => Promise<InstitutionalMemoryLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT = 100;
export const INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT = 500;

export function clampInstitutionalMemoryLensLimit(
  raw: number | undefined,
): number {
  if (raw == null || !Number.isFinite(raw)) {
    return INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT;
  }
  const n = Math.floor(raw);
  if (n <= 0) return INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT;
  if (n > INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT) {
    return INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT;
  }
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isInstitutionalMemoryNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildInstitutionalMemoryLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: InstitutionalMemoryLensReadResult;
  readonly now: Date;
}

const AGENT_NODE_PREFIX = "agent:";
const OWNER_NODE_PREFIX = "user:";
const DOMAIN_NODE_PREFIX = "domain:";
const WORKFLOW_NODE_PREFIX = "workflow:";

export function buildInstitutionalMemoryLensSnapshot(
  input: BuildInstitutionalMemoryLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isInstitutionalMemoryNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const ownerIdSet = new Set<number>();
  const domainSet = new Set<string>();
  for (const a of read.agents) {
    if (a.ownerId != null) ownerIdSet.add(a.ownerId);
    if (a.domain != null) domainSet.add(a.domain);
  }

  for (const ownerId of ownerIdSet) {
    const id = `${OWNER_NODE_PREFIX}${ownerId}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_owner",
        id,
        visible: true,
        label: `user ${ownerId}`,
        meta: { userId: ownerId },
      });
    } else {
      nodes.push({ typeKey: "inst_owner", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const domain of domainSet) {
    const id = `${DOMAIN_NODE_PREFIX}${domain}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_domain",
        id,
        visible: true,
        label: domain,
        meta: { domain },
      });
    } else {
      nodes.push({ typeKey: "inst_domain", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const a of read.agents) {
    const id = `${AGENT_NODE_PREFIX}${a.id}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_agent",
        id,
        visible: true,
        label: a.name,
        meta: {
          agentId: a.id,
          name: a.name,
          internalKey: a.internalKey,
          ownerId: a.ownerId,
          domain: a.domain,
          visibility: a.visibility,
          lifecycleState: a.lifecycleState,
          agentClass: a.agentClass,
          createdAt: a.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_agent", id, visible: false });
      hiddenNodeCount += 1;
    }

    if (a.ownerId != null) {
      edges.push({
        typeKey: "owned_by",
        sourceNodeId: id,
        targetNodeId: `${OWNER_NODE_PREFIX}${a.ownerId}`,
        visible: true,
      });
    }
    if (a.domain != null) {
      edges.push({
        typeKey: "belongs_to_domain",
        sourceNodeId: id,
        targetNodeId: `${DOMAIN_NODE_PREFIX}${a.domain}`,
        visible: true,
      });
    }
  }

  for (const wf of read.workflows ?? []) {
    const id = `${WORKFLOW_NODE_PREFIX}${wf.id}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_workflow",
        id,
        visible: true,
        label: wf.name,
        meta: {
          workflowId: wf.id,
          name: wf.name,
          description: wf.description,
          createdAt: wf.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_workflow", id, visible: false });
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

export interface CreateInstitutionalMemoryLensRunnerDeps {
  readonly read: InstitutionalMemoryLensReadFn;
  readonly now?: () => Date;
}

export function createInstitutionalMemoryLensRunner(
  deps: CreateInstitutionalMemoryLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampInstitutionalMemoryLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildInstitutionalMemoryLensSnapshot({
      def,
      viewer,
      read,
      now: now(),
    });
  };
}
