/**
 * GraphRepository — single boundary for all graph access.
 *
 * Native Graph Workspace MVP 0 — Phase 1.2.
 * ADR: docs/architecture/agent-studio-graph-repository-and-backend-strategy.md
 *
 * Every graph read / write goes through this interface. No application code
 * may import `neo4j-driver` or call raw Cypher / SQL graph queries outside
 * the repository / query-template-registry boundary.
 *
 * Boundary tested by: tests/agent-studio/graph-repository-boundary.test.ts
 */

// ============================================================================
// Backend identification
// ============================================================================

export type BackendKey =
  | "test"
  | "postgres"
  | "neo4j-ce"
  | "memgraph"
  | "falkor";

// ============================================================================
// Capability registry
// ============================================================================

export interface BackendCapabilities {
  readonly supportsCypher: boolean;
  readonly supportsGql: boolean;
  readonly supportsRecursiveTraversal: boolean;
  readonly supportsGraphAlgorithms: boolean;
  readonly supportsVectorIndex: boolean;
  readonly supportsFullTextIndex: boolean;
  readonly supportsPermissionFilterPushdown: boolean;
  readonly supportsMaterializedPaths: boolean;
  readonly supportsQueryExplain: boolean;
  readonly supportsBatchProjection: boolean;
  readonly supportsTemporalQueries: boolean;
  readonly supportsStreamingResults: boolean;
  readonly supportsCommunityEditionLimitations: boolean;
  readonly supportsEnterpriseUpgradePath: boolean;
}

// ============================================================================
// Common shapes
// ============================================================================

export interface NodeIdentity {
  readonly typeKey: string;
  readonly id: string;
  readonly sourceId?: string;
  readonly sourceVersionId?: string;
}

export interface EdgeIdentity {
  readonly typeKey: string;
  readonly id?: string;
  readonly sourceNode: NodeIdentity;
  readonly targetNode: NodeIdentity;
}

export interface NodeProperties {
  readonly [key: string]: unknown;
}

export interface EdgeProperties {
  readonly [key: string]: unknown;
}

export interface ProvenanceFields {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceVersionId?: string;
  readonly sourceLocator?: string;
  readonly createdByUserId?: number;
  readonly createdByProcess?: string;
  readonly createdByAgentId?: number;
  readonly confidence?: number;
  readonly lineageStatus: "derived" | "asserted" | "inferred" | "imported";
  readonly extractionMethod?: string;
  readonly validationStatus?: "unvalidated" | "validated" | "flagged";
  readonly governanceStatus?: "active" | "hidden" | "archived" | "deprecated";
  readonly validFrom?: string; // ISO timestamp
  readonly validTo?: string;
  readonly projectionSnapshotId?: string;
}

export interface RuntimeContext {
  readonly userId?: number;
  readonly userRole?: string;
  readonly workspaceId?: number;
  readonly allowedWorkspaces?: number[];
  readonly governanceStatusFilter?: ("active" | "hidden" | "archived" | "deprecated")[];
}

// ============================================================================
// Sub-interface: traversal
// ============================================================================

export interface TraversalOptions {
  readonly maxDepth: number;
  readonly maxResults: number;
  readonly timeoutMs?: number;
  readonly edgeTypeFilter?: string[];
  readonly nodeTypeFilter?: string[];
}

export interface TraversalPath {
  readonly nodes: NodeIdentity[];
  readonly edges: EdgeIdentity[];
  readonly length: number;
}

export interface GraphTraversalRepository {
  localGraph(
    seedNodeId: string,
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): Promise<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
    truncationReason?: string;
  }>;

  globalGraphSample(
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): Promise<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
  }>;

  neighborhood(
    nodeId: string,
    depth: number,
    runtime: RuntimeContext,
  ): Promise<{ nodes: NodeIdentity[]; edges: EdgeIdentity[] }>;

  shortestPath(
    fromNodeId: string,
    toNodeId: string,
    runtime: RuntimeContext,
  ): Promise<TraversalPath | null>;
}

// ============================================================================
// Sub-interface: projection
// ============================================================================

export interface ProjectionWrite {
  readonly kind: "upsert_node" | "upsert_edge" | "delete_node" | "delete_edge";
  readonly node?: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields };
  readonly edge?: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields };
}

export interface ProjectionResult {
  readonly nodesCreated: number;
  readonly nodesUpdated: number;
  readonly nodesDeleted: number;
  readonly edgesCreated: number;
  readonly edgesUpdated: number;
  readonly edgesDeleted: number;
  readonly durationMs: number;
  readonly errors: { write: ProjectionWrite; error: string }[];
}

export interface GraphProjectionRepository {
  upsertNode(
    node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields },
  ): Promise<void>;

  upsertEdge(
    edge: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields },
  ): Promise<void>;

  deleteNode(nodeId: string): Promise<void>;
  deleteEdge(edgeId: string): Promise<void>;

  applyProjectionJob(writes: ProjectionWrite[]): Promise<ProjectionResult>;
}

// ============================================================================
// Sub-interface: projection sync
// ============================================================================

export interface ProjectionSyncJobInput {
  readonly projectionKey: string;
  readonly triggerEvent: string;
  readonly triggerPayload: unknown;
  readonly snapshotId?: string;
}

export interface GraphProjectionSyncRepository {
  enqueueProjectionJob(input: ProjectionSyncJobInput): Promise<{ jobId: number }>;
  takeSnapshot(scope: string): Promise<{ snapshotId: string }>;
  detectDrift(scope: string): Promise<{
    driftEvents: { class: string; sourceId: string; details: unknown }[];
  }>;
  rebuildProjection(scope: string): Promise<ProjectionResult>;
}

// ============================================================================
// Sub-interface: query templates
// ============================================================================

export interface QueryTemplateExecutionInput {
  readonly templateKey: string;
  readonly parameters: Record<string, unknown>;
  readonly runtime: RuntimeContext;
}

export interface QueryTemplateExecutionResult {
  readonly rows: Record<string, unknown>[];
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly templateVersion: string;
}

export interface GraphQueryTemplateRepository {
  executeTemplate(input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult>;
}

// ============================================================================
// Sub-interface: graph algorithms
// ============================================================================

export type GraphAlgorithmKey =
  | "shortest_path"
  | "centrality"
  | "similarity"
  | "community_detection"
  | "blast_radius";

export interface GraphAlgorithmInput {
  readonly algorithmKey: GraphAlgorithmKey;
  readonly parameters: Record<string, unknown>;
  readonly runtime: RuntimeContext;
}

export interface GraphAlgorithmResult {
  readonly rows: Record<string, unknown>[];
  readonly durationMs: number;
}

export interface GraphAlgorithmRepository {
  runAlgorithm(input: GraphAlgorithmInput): Promise<GraphAlgorithmResult>;
}

// ============================================================================
// Sub-interface: permissions
// ============================================================================

export interface GraphPermissionRepository {
  filterByPermissions<T extends NodeIdentity>(
    nodes: T[],
    runtime: RuntimeContext,
  ): Promise<T[]>;

  isVisibleToUser(nodeId: string, runtime: RuntimeContext): Promise<boolean>;
}

// ============================================================================
// Sub-interface: explain
// ============================================================================

export interface GraphExplainRepository {
  explainPath(
    fromNodeId: string,
    toNodeId: string,
    runtime: RuntimeContext,
  ): Promise<{
    path: TraversalPath | null;
    cypher?: string;
    cost?: number;
  }>;

  explainNode(nodeId: string, runtime: RuntimeContext): Promise<{
    node: NodeIdentity;
    properties: NodeProperties;
    provenance: ProvenanceFields;
  } | null>;
}

// ============================================================================
// Sub-interface: benchmark
// ============================================================================

export interface BenchmarkScenario {
  readonly key: string;
  readonly description: string;
  readonly run: (repo: GraphRepository) => Promise<{ durationMs: number; resultCount: number }>;
}

export interface BenchmarkResult {
  readonly scenarioKey: string;
  readonly backendKey: BackendKey;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly meanMs: number;
  readonly samples: number[];
  readonly resultCount: number;
}

export interface GraphBenchmarkRepository {
  runBenchmark(scenario: BenchmarkScenario, iterations: number): Promise<BenchmarkResult>;
}

// ============================================================================
// Sub-interface: backend health
// ============================================================================

/**
 * Closed-taxonomy graph-backend health status. Promoted to a tuple at
 * T-G.50 so the metadata table + lockstep tests can be authored.
 */
export const GRAPH_BACKEND_HEALTH_STATUSES = [
  "healthy",
  "degraded",
  "unavailable",
] as const;
export type HealthStatus = (typeof GRAPH_BACKEND_HEALTH_STATUSES)[number];

// ============================================================================
// Per-health-status operator-facing metadata (T-G.50)
// ============================================================================

export interface GraphBackendHealthStatusMetadata {
  /** Display label rendered in the backend-health admin badge. */
  readonly label: string;
  /** Short operator-facing description of what this status means
   *  for the graph backend's serviceability. */
  readonly description: string;
  /** Whether the backend can serve graph reads at this status (true
   *  for `healthy` + `degraded`; false for `unavailable` which
   *  returns errors / serves cached fallbacks only). */
  readonly servesReads: boolean;
  /** Whether the operator should investigate at this status (true
   *  for `degraded` + `unavailable`; false for `healthy` which is
   *  the no-action baseline). */
  readonly requiresInvestigation: boolean;
}

export const GRAPH_BACKEND_HEALTH_STATUS_METADATA: Readonly<
  Record<HealthStatus, GraphBackendHealthStatusMetadata>
> = {
  healthy: {
    label: "Healthy",
    description:
      "Graph backend is reachable, returning queries within latency budgets, no error rate elevated. No action required.",
    servesReads: true,
    requiresInvestigation: false,
  },
  degraded: {
    label: "Degraded",
    description:
      "Backend reachable but with elevated latency or partial error rate. Reads still served; operator should investigate.",
    servesReads: true,
    requiresInvestigation: true,
  },
  unavailable: {
    label: "Unavailable",
    description:
      "Backend unreachable or failing health probe. Reads return errors or fall back to cache. Page on-call.",
    servesReads: false,
    requiresInvestigation: true,
  },
};

export function getGraphBackendHealthStatusMetadata(
  status: HealthStatus,
): GraphBackendHealthStatusMetadata {
  return GRAPH_BACKEND_HEALTH_STATUS_METADATA[status];
}

export interface BackendHealth {
  readonly status: HealthStatus;
  readonly latencyMs?: number;
  readonly errors?: string[];
  readonly capabilities: BackendCapabilities;
}

export interface GraphBackendHealthRepository {
  health(): Promise<BackendHealth>;
}

// ============================================================================
// Composite GraphRepository
// ============================================================================

export interface GraphRepository
  extends GraphTraversalRepository,
    GraphProjectionRepository,
    GraphProjectionSyncRepository,
    GraphQueryTemplateRepository,
    GraphAlgorithmRepository,
    GraphPermissionRepository,
    GraphExplainRepository,
    GraphBenchmarkRepository,
    GraphBackendHealthRepository {
  readonly backendKey: BackendKey;
  readonly capabilities: BackendCapabilities;
}

// ============================================================================
// Errors
// ============================================================================

export class GraphCapabilityUnsupportedError extends Error {
  readonly capability: keyof BackendCapabilities;
  readonly backendKey: BackendKey;
  constructor(capability: keyof BackendCapabilities, backendKey: BackendKey) {
    super(`Graph backend ${backendKey} does not support capability: ${String(capability)}`);
    this.capability = capability;
    this.backendKey = backendKey;
    this.name = "GraphCapabilityUnsupportedError";
  }
}

export class GraphPermissionDeniedError extends Error {
  readonly nodeId?: string;
  constructor(message: string, nodeId?: string) {
    super(message);
    this.nodeId = nodeId;
    this.name = "GraphPermissionDeniedError";
  }
}

export class GraphProjectionDriftError extends Error {
  readonly driftClass: string;
  readonly sourceId: string;
  constructor(driftClass: string, sourceId: string, message: string) {
    super(message);
    this.driftClass = driftClass;
    this.sourceId = sourceId;
    this.name = "GraphProjectionDriftError";
  }
}

export class GraphTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, message: string) {
    super(message);
    this.timeoutMs = timeoutMs;
    this.name = "GraphTimeoutError";
  }
}
