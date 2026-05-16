/**
 * Runtime lens runner — first real `LensRunnerFn` (T-F.59).
 *
 * Replaces the kind="runtime" stub from `stub-runners.ts` with a
 * snapshot derived from `agsRuntimeRuns` + `agsAgents`. Surfaces the
 * "Live agent runtime runs and their state transitions" view promised
 * by `GRAPH_LENS_KIND_METADATA.runtime`.
 *
 * Shape
 *   - One node per run, `typeKey="runtime_run"`. `id` is the run id
 *     stringified for cross-lens stability.
 *   - Edges:
 *       * `typeKey="parent_run"` — child → parent (set when
 *         `parentRunId` is non-null).
 *       * `typeKey="resumed_from_run"` — derived → source for
 *         `resumedFromRunId`.
 *       * `typeKey="compacted_from_run"` — derived → source for
 *         `compactedFromRunId`.
 *     Lineage edges are added ONLY when both endpoints are present in
 *     the node set (cap-truncated linked rows don't produce dangling
 *     edges).
 *   - Permission post-filter: a node is `visible` iff the viewer can
 *     see the agent — `agent.ownerId === viewer.userId` OR
 *     `agent.visibility === "public"` OR `run.triggeredBy ===
 *     viewer.userId`. Non-visible nodes are PRESENT (so subgraph shape
 *     reflects the hidden-by-permission count) but their `label` +
 *     `meta` are omitted — permission-leak invariant matches the
 *     impact-analysis contract (#993).
 *   - `hiddenNodeCount` = count of nodes with `visible=false`.
 *   - `truncated` = `true` when the row read hit the cap; the snapshot
 *     contains the most-recent `limit` runs.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import. Postgres `agsRuntimeRuns` is SoT.
 *   - No `dispatchMcpToolCall` / `openrouter` / `credential-resolver`.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via the `RuntimeLensReadFn` seam so the pure
 *     builder is unit-testable without a live ASDB.
 *
 * Design seam
 *   `buildRuntimeLensSnapshot` is a pure function; it is the heart of
 *   the runner. `createRuntimeLensRunner(read)` is a thin factory that
 *   wires the DB-read seam. The boot installer is in
 *   `install-runtime-lens-runner.ts` (sibling file).
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
// Read-seam shape (caller-owned; the DB-touching adapter implements it)
// ============================================================================

export interface RuntimeLensRunRow {
  readonly id: number;
  readonly agentId: number;
  readonly status: string;
  readonly parentRunId: number | null;
  readonly resumedFromRunId: number | null;
  readonly compactedFromRunId: number | null;
  readonly triggeredBy: number | null;
  readonly summary: string | null;
  readonly durationMs: number | null;
  readonly errorReason: string | null;
  readonly createdAt: Date;
}

export interface RuntimeLensAgentRow {
  readonly id: number;
  readonly ownerId: number | null;
  readonly visibility: string | null;
}

export interface RuntimeLensReadResult {
  readonly runs: ReadonlyArray<RuntimeLensRunRow>;
  readonly agentsById: ReadonlyMap<number, RuntimeLensAgentRow>;
  /** `true` when the underlying read hit the cap. The builder forwards
   *  this to `LensSnapshot.truncated`. */
  readonly truncated: boolean;
}

export interface RuntimeLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type RuntimeLensReadFn = (
  params: RuntimeLensReadParams,
) => Promise<RuntimeLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const RUNTIME_LENS_DEFAULT_LIMIT = 100;
export const RUNTIME_LENS_ABSOLUTE_LIMIT = 500;

/** Clamp a viewer-supplied limit into [1, RUNTIME_LENS_ABSOLUTE_LIMIT]. */
export function clampRuntimeLensLimit(
  raw: number | undefined,
): number {
  if (raw == null || !Number.isFinite(raw)) return RUNTIME_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return RUNTIME_LENS_DEFAULT_LIMIT;
  if (n > RUNTIME_LENS_ABSOLUTE_LIMIT) return RUNTIME_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate — pure
// ============================================================================

/**
 * Returns `true` iff the viewer is permitted to see this run's label
 * + meta. Hidden runs still appear as nodes in the snapshot but with
 * `label`/`meta` omitted (permission-leak invariant matches the
 * impact-analysis contract).
 */
export function isRuntimeRunVisibleToViewer(
  run: RuntimeLensRunRow,
  agent: RuntimeLensAgentRow | undefined,
  viewer: LensRunnerViewerContext,
): boolean {
  if (viewer.userId == null) return false;
  if (run.triggeredBy != null && run.triggeredBy === viewer.userId) return true;
  if (!agent) return false;
  if (agent.ownerId != null && agent.ownerId === viewer.userId) return true;
  if (agent.visibility === "public") return true;
  return false;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildRuntimeLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: RuntimeLensReadResult;
  readonly now: Date;
}

/**
 * Pure transformation of `(read result, viewer, def)` into a
 * `LensSnapshot`. Does NOT touch a clock or DB — the caller injects
 * `now`. Tests pin every branch.
 */
export function buildRuntimeLensSnapshot(
  input: BuildRuntimeLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];

  const runIdSet = new Set<string>();
  for (const run of read.runs) {
    runIdSet.add(String(run.id));
  }

  let hiddenNodeCount = 0;
  for (const run of read.runs) {
    const agent = read.agentsById.get(run.agentId);
    const visible = isRuntimeRunVisibleToViewer(run, agent, viewer);
    if (!visible) hiddenNodeCount += 1;

    if (visible) {
      nodes.push({
        typeKey: "runtime_run",
        id: String(run.id),
        visible: true,
        label: buildRunLabel(run),
        meta: buildRunMeta(run),
      });
    } else {
      // Permission-leak invariant: omit `label` + `meta` entirely.
      nodes.push({
        typeKey: "runtime_run",
        id: String(run.id),
        visible: false,
      });
    }
  }

  for (const run of read.runs) {
    pushLineageEdgeIfBothPresent(edges, runIdSet, run.id, run.parentRunId, "parent_run");
    pushLineageEdgeIfBothPresent(
      edges,
      runIdSet,
      run.id,
      run.resumedFromRunId,
      "resumed_from_run",
    );
    pushLineageEdgeIfBothPresent(
      edges,
      runIdSet,
      run.id,
      run.compactedFromRunId,
      "compacted_from_run",
    );
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

function buildRunLabel(run: RuntimeLensRunRow): string {
  return `run #${run.id} — ${run.status}`;
}

function buildRunMeta(run: RuntimeLensRunRow): Record<string, unknown> {
  // Stable shape — the renderer reads these by name.
  return {
    status: run.status,
    agentId: run.agentId,
    triggeredBy: run.triggeredBy,
    durationMs: run.durationMs,
    errorReason: run.errorReason,
    summary: run.summary,
    parentRunId: run.parentRunId,
    resumedFromRunId: run.resumedFromRunId,
    compactedFromRunId: run.compactedFromRunId,
    createdAt: run.createdAt.toISOString(),
  };
}

function pushLineageEdgeIfBothPresent(
  edges: LensSnapshotEdge[],
  runIdSet: ReadonlySet<string>,
  childId: number,
  parentId: number | null,
  typeKey: "parent_run" | "resumed_from_run" | "compacted_from_run",
): void {
  if (parentId == null) return;
  const sourceNodeId = String(childId);
  const targetNodeId = String(parentId);
  if (!runIdSet.has(targetNodeId)) return;
  edges.push({
    typeKey,
    sourceNodeId,
    targetNodeId,
    // Lineage edges always render — visibility is decided at node
    // level. (A visible child pointing at a redacted parent still
    // shows the edge; the parent is greyed-out per impact-analysis
    // contract.)
    visible: true,
  });
}

// ============================================================================
// Runner factory
// ============================================================================

export interface CreateRuntimeLensRunnerDeps {
  readonly read: RuntimeLensReadFn;
  readonly now?: () => Date;
}

/**
 * Build a `LensRunnerFn` from the read-seam + clock-seam dependencies.
 * The seam pattern matches the rest of the codebase (DI for DB +
 * clock; pure logic is independently testable).
 */
export function createRuntimeLensRunner(
  deps: CreateRuntimeLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampRuntimeLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildRuntimeLensSnapshot({ def, viewer, read, now: now() });
  };
}
