/**
 * PostgresGraphRepository — shallow fallback over ags_graph_* tables.
 *
 * Always available. Used when:
 *   - Phase 1.5 backend decision keeps Postgres as active backend, OR
 *   - Neo4j CE is unavailable and degraded mode falls back, OR
 *   - tests need real DB-backed behavior without Neo4j infra.
 *
 * Recursive CTE traversal supported up to depth-3 within performance targets
 * for the MVP scale (10k notes / 100k links / 50k nodes / 250k edges).
 *
 * SKELETON: full Drizzle-backed implementation lands in Phase 7.
 */

import type {
  BackendCapabilities,
  BackendHealth,
  BackendKey,
  BenchmarkResult,
  BenchmarkScenario,
  EdgeIdentity,
  EdgeProperties,
  GraphAlgorithmInput,
  GraphAlgorithmResult,
  GraphCapabilityUnsupportedError,
  GraphRepository,
  NodeIdentity,
  NodeProperties,
  ProjectionResult,
  ProjectionSyncJobInput,
  ProjectionWrite,
  ProvenanceFields,
  QueryTemplateExecutionInput,
  QueryTemplateExecutionResult,
  RuntimeContext,
  TraversalOptions,
  TraversalPath,
} from "./types.js";
import { POSTGRES_CAPABILITIES } from "./capabilities.js";

export interface PostgresGraphRepositoryOptions {
  /** Drizzle-style db client. Typed loosely so this skeleton compiles
   *  without binding to the full asdb client. Phase 7 wires the real client. */
  readonly db?: unknown;
}

export class PostgresGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "postgres";
  readonly capabilities: BackendCapabilities = POSTGRES_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly options: PostgresGraphRepositoryOptions = {}) {}

  // ----- Traversal -----

  async localGraph(_seedNodeId: string, _options: TraversalOptions, _runtime: RuntimeContext) {
    // SKELETON. Phase 7 implementation:
    //   WITH RECURSIVE walk AS (
    //     SELECT id FROM ags_graph_nodes WHERE id = $seedNodeId
    //     UNION
    //     SELECT e.target_node_id FROM ags_graph_edges e
    //       JOIN walk w ON e.source_node_id = w.id
    //       WHERE depth < $maxDepth
    //   )
    //   SELECT * FROM walk LIMIT $maxResults;
    return { nodes: [], edges: [], truncated: false };
  }

  async globalGraphSample(_options: TraversalOptions, _runtime: RuntimeContext) {
    return { nodes: [], edges: [], truncated: false };
  }

  async neighborhood(nodeId: string, depth: number, runtime: RuntimeContext) {
    const r = await this.localGraph(nodeId, { maxDepth: depth, maxResults: 1000 }, runtime);
    return { nodes: r.nodes, edges: r.edges };
  }

  async shortestPath(_from: string, _to: string, _runtime: RuntimeContext): Promise<TraversalPath | null> {
    return null;
  }

  // ----- Projection -----

  async upsertNode(_node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields }) {
    // Phase 7: upsert into ags_graph_nodes + ags_graph_node_properties.
  }

  async upsertEdge(_edge: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields }) {
    // Phase 7: upsert into ags_graph_edges + ags_graph_edge_properties.
  }

  async deleteNode(_nodeId: string) {}
  async deleteEdge(_edgeId: string) {}

  async applyProjectionJob(_writes: ProjectionWrite[]): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  // ----- Projection sync -----

  async enqueueProjectionJob(_input: ProjectionSyncJobInput): Promise<{ jobId: number }> {
    return { jobId: 0 };
  }

  async takeSnapshot(_scope: string): Promise<{ snapshotId: string }> {
    return { snapshotId: "" };
  }

  async detectDrift(_scope: string) {
    return { driftEvents: [] };
  }

  async rebuildProjection(_scope: string): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  // ----- Query templates -----

  async executeTemplate(_input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    return { rows: [], truncated: false, durationMs: 0, templateVersion: "1.0" };
  }

  // ----- Algorithms -----

  async runAlgorithm(_input: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    return { rows: [], durationMs: 0 };
  }

  // ----- Permissions -----

  async filterByPermissions<T extends NodeIdentity>(nodes: T[], _runtime: RuntimeContext): Promise<T[]> {
    return nodes;
  }

  async isVisibleToUser(_nodeId: string, _runtime: RuntimeContext): Promise<boolean> {
    return true;
  }

  // ----- Explain -----

  async explainPath(_from: string, _to: string, _runtime: RuntimeContext) {
    return { path: null };
  }

  async explainNode(_nodeId: string, _runtime: RuntimeContext) {
    return null;
  }

  // ----- Benchmark -----

  async runBenchmark(scenario: BenchmarkScenario, iterations: number): Promise<BenchmarkResult> {
    const samples: number[] = [];
    let resultCount = 0;
    for (let i = 0; i < iterations; i++) {
      const r = await scenario.run(this);
      samples.push(r.durationMs);
      resultCount = r.resultCount;
    }
    samples.sort((a, b) => a - b);
    return {
      scenarioKey: scenario.key,
      backendKey: this.backendKey,
      p50Ms: samples[Math.floor(samples.length * 0.5)] ?? 0,
      p95Ms: samples[Math.floor(samples.length * 0.95)] ?? 0,
      meanMs: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
      samples,
      resultCount,
    };
  }

  // ----- Health -----

  async health(): Promise<BackendHealth> {
    return { status: "healthy", capabilities: this.capabilities };
  }
}
