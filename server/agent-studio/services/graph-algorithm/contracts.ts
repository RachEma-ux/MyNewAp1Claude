/**
 * Graph Algorithm contracts — Phase 26 V2 §T-G.5.
 *
 * Roadmap §"Phase 26 — V2 Expansion: Plugins, Sync, Publish, Advanced
 * GraphRAG" enumerates a Graph Algorithm Toolset with 8 candidate
 * algorithms: centrality, community detection, similarity, shortest
 * path, dependency paths, blast radius, entity clustering, influence
 * analysis.
 *
 * This module pins the closed-taxonomy + per-algorithm request/result
 * shapes AHEAD of any backend wiring. Two reasons:
 *
 *   1. The Neo4j CE backend supports SOME of these natively (shortest
 *      path, basic centrality); others need GDS-equivalent libraries
 *      that may trigger Phase 27 Aura upgrade. Documenting which is
 *      which up-front means the implementation path is clear before
 *      any algorithm is wired.
 *   2. The lens-runner contract (T-F.5 #997) accepts a `LensSnapshot`;
 *      algorithm results are projected INTO a snapshot for rendering.
 *      Pinning the result shape now means the lens-runner can host
 *      algorithm-backed snapshots when the algorithm runtimes ship.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - Backend-agnostic — the contract doesn't lock in Neo4j-specific
 *     procedures; per-backend runners are registered separately.
 */

// ============================================================================
// Closed algorithm taxonomy
// ============================================================================

export const GRAPH_ALGORITHM_KINDS = [
  "centrality",
  "community_detection",
  "similarity",
  "shortest_path",
  "dependency_paths",
  "blast_radius",
  "entity_clustering",
  "influence_analysis",
] as const;

export type GraphAlgorithmKind = (typeof GRAPH_ALGORITHM_KINDS)[number];

export function isGraphAlgorithmKind(s: unknown): s is GraphAlgorithmKind {
  return (
    typeof s === "string" &&
    (GRAPH_ALGORITHM_KINDS as readonly string[]).includes(s)
  );
}

// ============================================================================
// Backend support taxonomy
// ============================================================================

export const GRAPH_ALGORITHM_BACKEND_SUPPORT = [
  "neo4j_ce_native",
  "neo4j_ce_via_apoc",
  "gds_required",
  "approximation_required",
] as const;

export type GraphAlgorithmBackendSupport =
  (typeof GRAPH_ALGORITHM_BACKEND_SUPPORT)[number];

// ============================================================================
// Per-backend-support operator-facing metadata (T-G.28)
// ============================================================================

export interface GraphAlgorithmBackendSupportMetadata {
  /** Display label for operator dashboards / algorithm pickers. */
  readonly label: string;
  /** Short description of the backend requirement. */
  readonly description: string;
  /** Whether this support level runs on the current CE deployment
   *  without a Phase 27 Aura upgrade. */
  readonly runsOnCe: boolean;
}

export const GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA: Readonly<
  Record<
    GraphAlgorithmBackendSupport,
    GraphAlgorithmBackendSupportMetadata
  >
> = {
  neo4j_ce_native: {
    label: "Neo4j CE (Native)",
    description:
      "Implementable in plain Cypher on Neo4j Community Edition. No plugin, no GDS, no upgrade required.",
    runsOnCe: true,
  },
  neo4j_ce_via_apoc: {
    label: "Neo4j CE (APOC)",
    description:
      "Requires the APOC plugin on Neo4j Community Edition. CE-compatible but needs operator action to install APOC.",
    runsOnCe: true,
  },
  gds_required: {
    label: "GDS Required",
    description:
      "Needs the Neo4j Graph Data Science library — gated by Phase 27 Aura upgrade. Not available on stock CE.",
    runsOnCe: false,
  },
  approximation_required: {
    label: "Approximation Required",
    description:
      "Exact algorithm exceeds CE compute budget. A best-effort approximation runs in app code; full accuracy needs Aura.",
    runsOnCe: false,
  },
};

export function getGraphAlgorithmBackendSupportMetadata(
  level: GraphAlgorithmBackendSupport,
): GraphAlgorithmBackendSupportMetadata {
  return GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA[level];
}

// ============================================================================
// Per-algorithm metadata
// ============================================================================

export interface GraphAlgorithmMetadata {
  /** Closed-taxonomy backend support level. */
  readonly backendSupport: GraphAlgorithmBackendSupport;
  /** Whether this algorithm triggers the Phase 27 Aura upgrade
   *  consideration (i.e. it needs GDS or APOC enterprise). */
  readonly triggersAuraUpgrade: boolean;
  /** Operator-facing description. */
  readonly description: string;
  /** Closed-taxonomy default max-iterations / max-nodes cap. The
   *  caller may override (within a `governanceScope`-enforced ceiling)
   *  but the default protects against runaway queries. */
  readonly defaultMaxNodes: number;
  readonly defaultMaxIterations: number;
}

export const GRAPH_ALGORITHM_METADATA: Readonly<
  Record<GraphAlgorithmKind, GraphAlgorithmMetadata>
> = {
  centrality: {
    backendSupport: "neo4j_ce_native",
    triggersAuraUpgrade: false,
    description:
      "Identifies the most-connected nodes — useful for finding the 'hubs' in any subgraph.",
    defaultMaxNodes: 10000,
    defaultMaxIterations: 20,
  },
  community_detection: {
    backendSupport: "gds_required",
    triggersAuraUpgrade: true,
    description:
      "Partitions nodes into clusters by connection density — Louvain / Label Propagation typically.",
    defaultMaxNodes: 50000,
    defaultMaxIterations: 10,
  },
  similarity: {
    backendSupport: "gds_required",
    triggersAuraUpgrade: true,
    description:
      "Computes node-pair similarity via Jaccard / Cosine over shared neighborhoods or property vectors.",
    defaultMaxNodes: 10000,
    defaultMaxIterations: 1,
  },
  shortest_path: {
    backendSupport: "neo4j_ce_native",
    triggersAuraUpgrade: false,
    description:
      "Shortest path between two nodes — direct Cypher `shortestPath` built-in.",
    defaultMaxNodes: 10000,
    defaultMaxIterations: 1,
  },
  dependency_paths: {
    backendSupport: "neo4j_ce_native",
    triggersAuraUpgrade: false,
    description:
      "All paths between two nodes filtered to dependency-typed edges (`DEPENDS_ON` / `IMPORTS` / `CALLS`).",
    defaultMaxNodes: 5000,
    defaultMaxIterations: 1,
  },
  blast_radius: {
    backendSupport: "neo4j_ce_native",
    triggersAuraUpgrade: false,
    description:
      "All nodes reachable from a starting node within N hops — sized impact analysis.",
    defaultMaxNodes: 5000,
    defaultMaxIterations: 1,
  },
  entity_clustering: {
    backendSupport: "approximation_required",
    triggersAuraUpgrade: true,
    description:
      "Groups likely-duplicate entity candidates for entity-resolution review. Feeds Phase 23 correction proposals.",
    defaultMaxNodes: 50000,
    defaultMaxIterations: 5,
  },
  influence_analysis: {
    backendSupport: "gds_required",
    triggersAuraUpgrade: true,
    description:
      "Page-rank-style influence score — surfaces 'institutional weight' of a node within its subgraph.",
    defaultMaxNodes: 50000,
    defaultMaxIterations: 30,
  },
};

// ============================================================================
// Per-algorithm UI metadata (T-G.31)
// ============================================================================

export const GRAPH_ALGORITHM_CATEGORIES = [
  "centrality",
  "community",
  "similarity",
  "path_analysis",
  "impact_analysis",
] as const;

export type GraphAlgorithmCategory =
  (typeof GRAPH_ALGORITHM_CATEGORIES)[number];

export interface GraphAlgorithmKindMetadata {
  /** Display label for operator dashboards / algorithm pickers. */
  readonly label: string;
  /** Closed-taxonomy UI grouping for the algorithm picker. */
  readonly category: GraphAlgorithmCategory;
  /** Operator-facing description (longer than `GRAPH_ALGORITHM_METADATA.description`,
   *  describes what the algorithm answers for the operator, not how it's
   *  implemented). */
  readonly operatorIntent: string;
}

export const GRAPH_ALGORITHM_KIND_METADATA: Readonly<
  Record<GraphAlgorithmKind, GraphAlgorithmKindMetadata>
> = {
  centrality: {
    label: "Centrality",
    category: "centrality",
    operatorIntent:
      "Which nodes are the most-connected hubs in this subgraph? Surfaces 'institutional weight' targets for review or audit.",
  },
  community_detection: {
    label: "Community Detection",
    category: "community",
    operatorIntent:
      "Which clusters of densely-connected nodes exist? Partitions the graph into communities for operator triage.",
  },
  similarity: {
    label: "Node Similarity",
    category: "similarity",
    operatorIntent:
      "Which node-pairs share the most neighbors or features? Surfaces merge candidates and analogy seeds.",
  },
  shortest_path: {
    label: "Shortest Path",
    category: "path_analysis",
    operatorIntent:
      "What is the shortest connection between two specific nodes? Answers 'how is A related to B' in the fewest hops.",
  },
  dependency_paths: {
    label: "Dependency Paths",
    category: "path_analysis",
    operatorIntent:
      "What are all dependency chains between two nodes? Filtered to `DEPENDS_ON` / `IMPORTS` / `CALLS` edges.",
  },
  blast_radius: {
    label: "Blast Radius",
    category: "impact_analysis",
    operatorIntent:
      "What nodes are reachable from a starting node within N hops? Sizes 'who is affected if this changes'.",
  },
  entity_clustering: {
    label: "Entity Clustering",
    category: "community",
    operatorIntent:
      "Which entities are likely duplicates? Groups merge candidates for entity-resolution review.",
  },
  influence_analysis: {
    label: "Influence Analysis",
    category: "centrality",
    operatorIntent:
      "Which nodes have outsized downstream influence? Page-rank-style scoring within the subgraph.",
  },
};

export function getGraphAlgorithmKindMetadata(
  kind: GraphAlgorithmKind,
): GraphAlgorithmKindMetadata {
  return GRAPH_ALGORITHM_KIND_METADATA[kind];
}

// ============================================================================
// Request + Result shapes
// ============================================================================

export interface GraphAlgorithmRequest {
  readonly kind: GraphAlgorithmKind;
  readonly workspaceId: number;
  /** Closed scope identifier — the algorithm's per-workspace subgraph
   *  scope. Per-lens runners pass their lens id here. */
  readonly scopeId: string;
  /** Optional max nodes; clamped to the per-algorithm default. */
  readonly maxNodes?: number;
  /** Optional max iterations; clamped to the per-algorithm default. */
  readonly maxIterations?: number;
  /** Algorithm-specific args, opaque to the registry. */
  readonly args?: Record<string, unknown>;
}

export interface GraphAlgorithmResultRow {
  readonly nodeTypeKey: string;
  readonly nodeId: string;
  /** Algorithm score / label / rank. Type narrowed at consumption. */
  readonly value: number | string;
  /** Per-result-row permission flag — false = redacted, true = visible. */
  readonly visible: boolean;
}

export interface GraphAlgorithmResult {
  readonly kind: GraphAlgorithmKind;
  readonly scopeId: string;
  readonly producedAt: Date;
  readonly rows: ReadonlyArray<GraphAlgorithmResultRow>;
  /** True when the algorithm hit its node / iteration cap. */
  readonly truncated: boolean;
  /** Operator-surface count of rows filtered to visible=false. */
  readonly hiddenRowCount: number;
}

// ============================================================================
// Validation helpers
// ============================================================================

export class GraphAlgorithmMaxNodesOutOfRangeError extends Error {
  constructor(value: number, kind: GraphAlgorithmKind) {
    super(
      `maxNodes=${value} is invalid for algorithm "${kind}" (must be >= 1).`,
    );
    this.name = "GraphAlgorithmMaxNodesOutOfRangeError";
  }
}

export class GraphAlgorithmMaxIterationsOutOfRangeError extends Error {
  constructor(value: number, kind: GraphAlgorithmKind) {
    super(
      `maxIterations=${value} is invalid for algorithm "${kind}" (must be >= 1).`,
    );
    this.name = "GraphAlgorithmMaxIterationsOutOfRangeError";
  }
}

export function normalizeAlgorithmMaxNodes(
  kind: GraphAlgorithmKind,
  input: number | undefined,
): number {
  const meta = GRAPH_ALGORITHM_METADATA[kind];
  if (input === undefined) return meta.defaultMaxNodes;
  if (!Number.isFinite(input) || input < 1) {
    throw new GraphAlgorithmMaxNodesOutOfRangeError(input, kind);
  }
  // Clamp at default (operators with bigger needs register their
  // own algorithm runner with raised defaults).
  return Math.min(Math.floor(input), meta.defaultMaxNodes);
}

export function normalizeAlgorithmMaxIterations(
  kind: GraphAlgorithmKind,
  input: number | undefined,
): number {
  const meta = GRAPH_ALGORITHM_METADATA[kind];
  if (input === undefined) return meta.defaultMaxIterations;
  if (!Number.isFinite(input) || input < 1) {
    throw new GraphAlgorithmMaxIterationsOutOfRangeError(input, kind);
  }
  return Math.min(Math.floor(input), meta.defaultMaxIterations);
}

// ============================================================================
// Pre-flight: request → runtime decision (runnable / requires_upgrade / gated)
// ============================================================================

/** Closed-taxonomy outcome the lens UI + dispatcher use to decide
 *  whether to invoke the algorithm or surface an upgrade banner. */
export type GraphAlgorithmPreflightDecision =
  | "runnable_on_ce_native"
  | "runnable_on_ce_via_apoc"
  | "runnable_via_approximation"
  | "requires_aura_upgrade";

export interface GraphAlgorithmPreflightOutcome {
  readonly decision: GraphAlgorithmPreflightDecision;
  /** Resolved (defaults-filled, clamped) bound for `maxNodes`. */
  readonly resolvedMaxNodes: number;
  /** Resolved bound for `maxIterations`. */
  readonly resolvedMaxIterations: number;
  /** True when `decision === "requires_aura_upgrade"`. */
  readonly auraUpgradeRequired: boolean;
}

/**
 * Pure request validator. Normalizes bounds + maps backend-support to
 * a runtime decision. Throws on out-of-range inputs (same semantics as
 * the individual normalizers).
 *
 * The future runtime invokes this BEFORE dispatching to the actual
 * graph backend so the lens UI gets a stable preflight result without
 * needing to read the backend-support taxonomy itself.
 */
export function preflightAlgorithmRequest(
  request: GraphAlgorithmRequest,
): GraphAlgorithmPreflightOutcome {
  const meta = GRAPH_ALGORITHM_METADATA[request.kind];
  const resolvedMaxNodes = normalizeAlgorithmMaxNodes(
    request.kind,
    request.maxNodes,
  );
  const resolvedMaxIterations = normalizeAlgorithmMaxIterations(
    request.kind,
    request.maxIterations,
  );
  let decision: GraphAlgorithmPreflightDecision;
  switch (meta.backendSupport) {
    case "neo4j_ce_native":
      decision = "runnable_on_ce_native";
      break;
    case "neo4j_ce_via_apoc":
      decision = "runnable_on_ce_via_apoc";
      break;
    case "approximation_required":
      decision = "runnable_via_approximation";
      break;
    case "gds_required":
      decision = "requires_aura_upgrade";
      break;
  }
  return {
    decision,
    resolvedMaxNodes,
    resolvedMaxIterations,
    auraUpgradeRequired: decision === "requires_aura_upgrade",
  };
}

/**
 * Returns the subset of algorithm kinds that trigger Phase 27 Aura
 * upgrade — operators decide whether to enable these in the lens
 * UI's "advanced algorithms" toggle.
 */
export function listAlgorithmsTriggeringAuraUpgrade(): ReadonlyArray<GraphAlgorithmKind> {
  return GRAPH_ALGORITHM_KINDS.filter(
    (k) => GRAPH_ALGORITHM_METADATA[k].triggersAuraUpgrade,
  );
}

/**
 * Returns the subset of algorithm kinds Neo4j CE can run natively
 * without Aura. The lens UI uses this to set the "no upgrade
 * required" badge.
 */
export function listAlgorithmsAvailableOnCe(): ReadonlyArray<GraphAlgorithmKind> {
  return GRAPH_ALGORITHM_KINDS.filter(
    (k) =>
      GRAPH_ALGORITHM_METADATA[k].backendSupport === "neo4j_ce_native" ||
      GRAPH_ALGORITHM_METADATA[k].backendSupport === "neo4j_ce_via_apoc",
  );
}

// ============================================================================
// Algorithm backend coverage summary (T-G.17)
// ============================================================================

export interface GraphAlgorithmCoverageSummary {
  readonly total: number;
  readonly byBackendSupport: Readonly<
    Record<GraphAlgorithmBackendSupport, number>
  >;
  readonly availableOnCe: number;
  readonly triggersAuraUpgrade: number;
  /** Percentage available on CE, 1-decimal precision. */
  readonly cePercent: number;
}

/**
 * Returns a stable-shape summary of algorithm backend coverage:
 * how many algorithms each backend-support level applies to, how
 * many run on CE today, and how many trigger the Phase 27 Aura
 * upgrade consideration.
 *
 * Operator dashboards use this for the lens-UI's "advanced
 * algorithms" toggle availability header.
 *
 * Pure function. Reads only from the canonical
 * `GRAPH_ALGORITHM_METADATA`.
 */
export function summarizeGraphAlgorithmCoverage(): GraphAlgorithmCoverageSummary {
  const byBackendSupport: Record<string, number> = {};
  for (const s of GRAPH_ALGORITHM_BACKEND_SUPPORT) byBackendSupport[s] = 0;

  let availableOnCe = 0;
  let triggersAuraUpgrade = 0;
  for (const k of GRAPH_ALGORITHM_KINDS) {
    const meta = GRAPH_ALGORITHM_METADATA[k];
    byBackendSupport[meta.backendSupport] += 1;
    if (
      meta.backendSupport === "neo4j_ce_native" ||
      meta.backendSupport === "neo4j_ce_via_apoc"
    ) {
      availableOnCe += 1;
    }
    if (meta.triggersAuraUpgrade) triggersAuraUpgrade += 1;
  }
  const total = GRAPH_ALGORITHM_KINDS.length;
  const cePercent =
    total === 0 ? 0 : Math.round((availableOnCe / total) * 1000) / 10;
  return {
    total,
    byBackendSupport: byBackendSupport as Readonly<
      Record<GraphAlgorithmBackendSupport, number>
    >,
    availableOnCe,
    triggersAuraUpgrade,
    cePercent,
  };
}
