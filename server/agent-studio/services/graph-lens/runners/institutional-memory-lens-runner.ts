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

/**
 * Person row — second projector-backed institutional memory node
 * type (T-G.1.β). Emits `inst_person` typeKey nodes mapped from the
 * existing `users` table per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.person`. Per-workspace
 * visibility is enforced at the read seam (the reader filters out
 * users not visible to the viewer's workspace); the runner relies on
 * that boundary.
 */
export interface InstitutionalMemoryLensPersonRow {
  readonly id: number;
  /** Display name; nullable in `users` — runner falls back to email
   *  then to `user-${id}` so the label is never empty. */
  readonly name: string | null;
  readonly email: string | null;
  readonly role: string;
  readonly createdAt: Date;
}

/**
 * Project row — third projector-backed institutional memory node
 * type (T-G.1.γ). Emits `inst_project` typeKey nodes mapped from the
 * existing `workspaces` table per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.project` ("Workspace == project
 * in MVP"). The reader is responsible for permission-scoping the
 * workspaces list to those the viewer can see; the runner relies on
 * that boundary.
 */
export interface InstitutionalMemoryLensProjectRow {
  readonly id: number;
  readonly name: string;
  readonly purposeType: string | null;
  readonly status: string;
  readonly ownerId: number;
  readonly createdAt: Date;
}

/**
 * Decision row — fourth projector-backed institutional memory node
 * type (T-G.1.δ). Emits `inst_decision` typeKey nodes mapped from the
 * existing `ags_approval_steps` table per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.decision`: approval steps ARE
 * decisions, with the outcome (approved/rejected/pending) on
 * `state` and the rationale on `decisionNote`.
 */
export interface InstitutionalMemoryLensDecisionRow {
  readonly id: number;
  readonly publishRequestId: number;
  readonly stepOrder: number;
  readonly approverRole: string;
  /** Lifecycle state — typically pending/approved/rejected/skipped. */
  readonly state: string;
  readonly decidedBy: number | null;
  readonly decisionNote: string | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Outcome row — fifth projector-backed institutional memory node
 * type (T-G.1.ε). Emits `inst_outcome` typeKey nodes mapped from the
 * existing `ags_runtime_runs` table per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.outcome`: runtime runs PRODUCE
 * outcomes, with `status` carrying the terminal verdict and `summary`
 * carrying the rationale. `agentKey` is denormalized into the read
 * row so the lens can label outcomes without joining back to agents.
 */
export interface InstitutionalMemoryLensOutcomeRow {
  readonly id: number;
  readonly agentId: number;
  /** Denormalized from `agsAgents.internalKey` for label-without-join. */
  readonly agentKey: string;
  readonly environment: string;
  /** Lifecycle status — pending/running/succeeded/failed/aborted/etc. */
  readonly status: string;
  readonly summary: string | null;
  readonly durationMs: number | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Timeline event row — sixth projector-backed institutional memory
 * node type (T-G.1.ζ). Emits `inst_timeline_event` typeKey nodes
 * mapped from `ags_runtime_runs` per
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING.timeline_event`.
 *
 * The source-mapping note observes that "the lens-runner unions
 * multiple tables (approval_steps, vault_versions, governance_records)
 * into the timeline; the primary mapping here is the largest." The
 * read row therefore carries a `sourceKind` discriminator so future
 * additive reads can union into the same `timelineEvents?:` slot
 * without breaking the typeKey contract — operators read all timeline
 * events through one shape, but each event remembers where it came
 * from.
 */
export interface InstitutionalMemoryLensTimelineEventRow {
  readonly id: number;
  /** Discriminator — which source table the event was derived from. */
  readonly sourceKind:
    | "runtime_run"
    | "approval_step"
    | "vault_version"
    | "governance_record";
  /** Temporal anchor — usually `createdAt` from the source row. */
  readonly occurredAt: Date;
  /** Pre-rendered display label; reader composes from source columns. */
  readonly label: string;
  /** Optional opaque meta — reader includes any source-specific fields
   * useful for drill-in. */
  readonly meta: Record<string, unknown> | null;
}

export interface InstitutionalMemoryLensReadResult {
  readonly agents: ReadonlyArray<InstitutionalMemoryLensAgentRow>;
  /** Optional — defaults to `[]` for callers that haven't migrated to the
   * projector-backed shape. New typeKey-aligned reads land additively. */
  readonly workflows?: ReadonlyArray<InstitutionalMemoryLensWorkflowRow>;
  /** T-G.1.β — optional projector-backed person reads. */
  readonly persons?: ReadonlyArray<InstitutionalMemoryLensPersonRow>;
  /** T-G.1.γ — optional projector-backed project (workspace) reads. */
  readonly projects?: ReadonlyArray<InstitutionalMemoryLensProjectRow>;
  /** T-G.1.δ — optional projector-backed decision reads. */
  readonly decisions?: ReadonlyArray<InstitutionalMemoryLensDecisionRow>;
  /** T-G.1.ε — optional projector-backed outcome (runtime run) reads. */
  readonly outcomes?: ReadonlyArray<InstitutionalMemoryLensOutcomeRow>;
  /** T-G.1.ζ — optional projector-backed timeline event reads. */
  readonly timelineEvents?: ReadonlyArray<InstitutionalMemoryLensTimelineEventRow>;
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
const PERSON_NODE_PREFIX = "person:";
const PROJECT_NODE_PREFIX = "project:";
const DECISION_NODE_PREFIX = "decision:";
const OUTCOME_NODE_PREFIX = "outcome:";
const TIMELINE_EVENT_NODE_PREFIX = "timeline_event:";

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

  for (const p of read.persons ?? []) {
    const id = `${PERSON_NODE_PREFIX}${p.id}`;
    if (visible) {
      // Label fallback ladder: name → email → user-${id}
      const label = p.name ?? p.email ?? `user-${p.id}`;
      nodes.push({
        typeKey: "inst_person",
        id,
        visible: true,
        label,
        meta: {
          personId: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          createdAt: p.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_person", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const pr of read.projects ?? []) {
    const id = `${PROJECT_NODE_PREFIX}${pr.id}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_project",
        id,
        visible: true,
        label: pr.name,
        meta: {
          projectId: pr.id,
          name: pr.name,
          purposeType: pr.purposeType,
          status: pr.status,
          ownerId: pr.ownerId,
          createdAt: pr.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_project", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const d of read.decisions ?? []) {
    const id = `${DECISION_NODE_PREFIX}${d.id}`;
    if (visible) {
      // Label encodes outcome + approver-role so operators can see at
      // a glance what was decided and by whom (role, not user — user
      // identity is on `decidedBy` in meta).
      const label = `${d.state}: ${d.approverRole} (step ${d.stepOrder})`;
      nodes.push({
        typeKey: "inst_decision",
        id,
        visible: true,
        label,
        meta: {
          decisionId: d.id,
          publishRequestId: d.publishRequestId,
          stepOrder: d.stepOrder,
          approverRole: d.approverRole,
          state: d.state,
          decidedBy: d.decidedBy,
          decisionNote: d.decisionNote,
          decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_decision", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const o of read.outcomes ?? []) {
    const id = `${OUTCOME_NODE_PREFIX}${o.id}`;
    if (visible) {
      // Label encodes status + agentKey + env so operators see at a
      // glance what happened, to which agent, in which environment.
      const label = `${o.status}: ${o.agentKey} (${o.environment})`;
      nodes.push({
        typeKey: "inst_outcome",
        id,
        visible: true,
        label,
        meta: {
          outcomeId: o.id,
          agentId: o.agentId,
          agentKey: o.agentKey,
          environment: o.environment,
          status: o.status,
          summary: o.summary,
          durationMs: o.durationMs,
          finishedAt: o.finishedAt ? o.finishedAt.toISOString() : null,
          createdAt: o.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_outcome", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const ev of read.timelineEvents ?? []) {
    // Node id includes sourceKind so unioned reads (runtime_run +
    // approval_step + vault_version + governance_record) never
    // collide on raw numeric id across tables.
    const id = `${TIMELINE_EVENT_NODE_PREFIX}${ev.sourceKind}:${ev.id}`;
    if (visible) {
      nodes.push({
        typeKey: "inst_timeline_event",
        id,
        visible: true,
        label: ev.label,
        meta: {
          eventId: ev.id,
          sourceKind: ev.sourceKind,
          occurredAt: ev.occurredAt.toISOString(),
          ...(ev.meta ?? {}),
        },
      });
    } else {
      nodes.push({ typeKey: "inst_timeline_event", id, visible: false });
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
