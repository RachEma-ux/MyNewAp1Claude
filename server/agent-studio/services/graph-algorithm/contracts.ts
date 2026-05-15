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
