/**
 * Lens Runner contract — Phase 24 §T-F.5.
 *
 * A `LensRunnerFn` takes a registered `GraphLensDefinition` + a
 * viewer context and returns a `LensSnapshot`. Different concrete
 * lens kinds (rag / governance / runtime / etc.) register their
 * own runners; the registry pairs a definition's `kind` with a
 * runner.
 *
 * Why this is a contract-only PR:
 *   - Concrete runner implementations differ wildly (a `runtime`
 *     lens runner reads `agsRuntimeRuns`; a `governance` lens
 *     runner reads `agsApprovalSteps`). The runner SHAPE is what's
 *     stable; the implementations land per-lens later.
 *   - Locking the shape now means downstream slices (T-F.4, T-G.1
 *     concrete lens, T-G.3 security lens) all plug in by name.
 *   - Permission-aware filter discipline is enforced via the shape:
 *     every snapshot node carries `visible` (just like the
 *     impact-analysis contract from #993).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - The contract obligates concrete runners to route their graph
 *     reads through `services/graph/repository/**`; runners that
 *     bypass it fail their own per-lens source-scan tests.
 */

import { GRAPH_LENS_KINDS } from "./contracts.js";
import type {
  GraphLensDefinition,
  GraphLensKind,
  GraphLensLayout,
} from "./contracts.js";

// ============================================================================
// Viewer context — every runner receives this
// ============================================================================

export interface LensRunnerViewerContext {
  /** Workspace scope. Runners MUST scope reads by this. */
  readonly workspaceId: number;
  /** Viewer user id. Permission post-filter uses this. */
  readonly userId: number | null;
  /** Optional time-bound — "show me the lens AS OF this date".
   *  When omitted, runners use NOW. */
  readonly asOf?: Date;
  /** Optional cap on result-set size. Default depends on the kind;
   *  runners enforce their own caps. */
  readonly limit?: number;
}

// ============================================================================
// Snapshot shape — every runner returns this
// ============================================================================

export interface LensSnapshotNode {
  readonly typeKey: string;
  readonly id: string;
  /** Permission post-filter outcome. False = redacted; the renderer
   *  greys-out the node without surfacing its content. */
  readonly visible: boolean;
  /** Display label — present only when `visible=true`. */
  readonly label?: string;
  /** Optional per-kind decoration the runner emits. Opaque to the
   *  registry; the renderer interprets per-kind. */
  readonly meta?: Record<string, unknown>;
}

export interface LensSnapshotEdge {
  readonly typeKey: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly visible: boolean;
}

export interface LensSnapshot {
  readonly lensId: string;
  readonly kind: GraphLensKind;
  readonly layout: GraphLensLayout;
  /** UTC timestamp the snapshot was produced. */
  readonly producedAt: Date;
  readonly nodes: ReadonlyArray<LensSnapshotNode>;
  readonly edges: ReadonlyArray<LensSnapshotEdge>;
  /** Filter-step output: how many nodes were classified as
   *  visible=false. UI surfaces this for "N hidden by permission"
   *  signaling. */
  readonly hiddenNodeCount: number;
  /** When the runner hit its own cap (limit), this is set so the
   *  renderer can surface "more results exist". */
  readonly truncated: boolean;
}

// ============================================================================
// Runner function signature
// ============================================================================

export type LensRunnerFn = (
  def: GraphLensDefinition,
  viewer: LensRunnerViewerContext,
) => Promise<LensSnapshot>;

// ============================================================================
// Runner registry — kind → runner
// ============================================================================

const runnersByKind = new Map<GraphLensKind, LensRunnerFn>();

export class LensRunnerAlreadyRegisteredForKindError extends Error {
  constructor(kind: GraphLensKind) {
    super(`A lens runner is already registered for kind="${kind}".`);
    this.name = "LensRunnerAlreadyRegisteredForKindError";
  }
}

export class LensRunnerNotRegisteredForKindError extends Error {
  constructor(kind: GraphLensKind) {
    super(`No lens runner is registered for kind="${kind}".`);
    this.name = "LensRunnerNotRegisteredForKindError";
  }
}

/**
 * Register a runner for a lens kind. Idempotency: re-registering
 * the same kind throws. Boot installers register at startup.
 */
export function registerLensRunner(
  kind: GraphLensKind,
  fn: LensRunnerFn,
): void {
  if (runnersByKind.has(kind)) {
    throw new LensRunnerAlreadyRegisteredForKindError(kind);
  }
  runnersByKind.set(kind, fn);
}

/**
 * Returns the runner for a kind, or undefined when none is
 * registered. The tRPC layer uses this to fall back to a "no runner
 * yet" response (different from a runtime error) when an operator
 * tries to render a lens whose kind hasn't shipped a runner yet.
 */
export function getLensRunner(kind: GraphLensKind): LensRunnerFn | undefined {
  return runnersByKind.get(kind);
}

/**
 * Run the appropriate runner for the given definition. Throws
 * `LensRunnerNotRegisteredForKindError` when no runner is registered;
 * callers may handle that gracefully (operator UI surface) or let
 * it propagate.
 */
export async function runLens(
  def: GraphLensDefinition,
  viewer: LensRunnerViewerContext,
): Promise<LensSnapshot> {
  const runner = runnersByKind.get(def.kind);
  if (!runner) throw new LensRunnerNotRegisteredForKindError(def.kind);
  return runner(def, viewer);
}

/**
 * List the kinds that have a runner registered. Operator dashboard
 * uses this to show "8 lens kinds defined, N have runners."
 */
export function listLensRunnerKinds(): ReadonlyArray<GraphLensKind> {
  return Array.from(runnersByKind.keys());
}

/**
 * Test-only — clear the runner registry between tests so
 * registration order is deterministic.
 */
export function __resetLensRunnerRegistryForTests(): void {
  runnersByKind.clear();
}

// ============================================================================
// Runner registry coverage summary (T-F.12)
// ============================================================================

export interface LensRunnerRegistryCoverageSummary {
  readonly totalKinds: number;
  readonly registeredKinds: number;
  readonly missingKinds: ReadonlyArray<GraphLensKind>;
  /** 0..100, 1-decimal. Useful for "X% of lens kinds have runners"
   *  operator gauge. 0% when totalKinds is 0 (avoids NaN). */
  readonly coveragePercent: number;
}

/**
 * Returns a stable-shape summary of runner-registry coverage relative
 * to the closed `GRAPH_LENS_KINDS` taxonomy. `missingKinds` lists the
 * kinds without runners — operator dashboards can use this to render
 * a "still placeholder" badge.
 *
 * Reads the module-local registry. Pure with respect to its inputs.
 */
export function summarizeLensRunnerRegistry(): LensRunnerRegistryCoverageSummary {
  const totalKinds = GRAPH_LENS_KINDS.length;
  const registered: GraphLensKind[] = [];
  const missing: GraphLensKind[] = [];
  for (const k of GRAPH_LENS_KINDS) {
    if (runnersByKind.has(k)) registered.push(k);
    else missing.push(k);
  }
  const coveragePercent =
    totalKinds === 0
      ? 0
      : Math.round((registered.length / totalKinds) * 1000) / 10;
  return {
    totalKinds,
    registeredKinds: registered.length,
    missingKinds: missing,
    coveragePercent,
  };
}

// ============================================================================
// Snapshot aggregation (T-F.11)
// ============================================================================

export interface LensSnapshotSummary {
  readonly totalNodes: number;
  readonly visibleNodes: number;
  readonly hiddenNodes: number;
  readonly totalEdges: number;
  readonly visibleEdges: number;
  readonly hiddenEdges: number;
  /** Per-typeKey counts (sparse — typeKeys are not closed at this
   *  level since each lens-kind defines its own taxonomy). */
  readonly nodesByTypeKey: Readonly<Record<string, number>>;
  readonly edgesByTypeKey: Readonly<Record<string, number>>;
  /** Passthrough of snapshot.truncated. */
  readonly truncated: boolean;
}

/**
 * Aggregates a `LensSnapshot` into a stable-shape summary suitable
 * for operator dashboards. Counts for visibility + per-typeKey
 * histograms (sparse — different lens kinds use different node-type
 * taxonomies, so the histogram is keyed by observed types).
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeLensSnapshot(
  snapshot: LensSnapshot,
): LensSnapshotSummary {
  let visibleNodes = 0;
  const nodesByTypeKey: Record<string, number> = {};
  for (const n of snapshot.nodes) {
    if (n.visible) visibleNodes += 1;
    nodesByTypeKey[n.typeKey] = (nodesByTypeKey[n.typeKey] ?? 0) + 1;
  }
  let visibleEdges = 0;
  const edgesByTypeKey: Record<string, number> = {};
  for (const e of snapshot.edges) {
    if (e.visible) visibleEdges += 1;
    edgesByTypeKey[e.typeKey] = (edgesByTypeKey[e.typeKey] ?? 0) + 1;
  }
  return {
    totalNodes: snapshot.nodes.length,
    visibleNodes,
    hiddenNodes: snapshot.nodes.length - visibleNodes,
    totalEdges: snapshot.edges.length,
    visibleEdges,
    hiddenEdges: snapshot.edges.length - visibleEdges,
    nodesByTypeKey,
    edgesByTypeKey,
    truncated: snapshot.truncated,
  };
}
