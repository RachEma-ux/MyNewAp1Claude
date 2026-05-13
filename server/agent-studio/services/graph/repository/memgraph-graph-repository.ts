/**
 * MemgraphGraphRepository — fallback Cypher-compatible adapter.
 *
 * Memgraph speaks the Bolt protocol and Cypher (with some dialect
 * deltas vs Neo4j; see `agent-studio-active-graph-backend-decision.md`
 * §3 fallback path). Adapter shape mirrors Neo4jCommunityGraphRepository
 * because both targets share the same chokepoint surface:
 *   - `neo4j-driver` is the only protocol library
 *   - the `GraphRepository` interface is the same
 *   - Cypher template execution flows through `ags_query_templates`
 *
 * IMPORTANT: This file is the SECOND place outside KGIA where Neo4j-
 * protocol-specific concepts may leak into the codebase (the first
 * is `neo4j-community-graph-repository.ts`). All other code uses
 * `GraphRepository`.
 *
 * Adapter readiness today: SKELETON — like the Neo4j CE adapter, the
 * methods return empty / typed stubs. Phase 1.5 fallback wiring lands
 * the real driver calls in a dedicated operator-implementation PR
 * once the Neo4j CE G3 benchmark fails its targets and the operator
 * chooses Memgraph per the runbook §8.1 path.
 *
 * Status (honest classification per the strict audit):
 *   PARTIALLY IMPLEMENTED — adapter exists + backend key registered +
 *   getGraphRepository() supports `GRAPH_BACKEND=memgraph`. Real
 *   driver wiring + Memgraph-dialect Cypher template execution still
 *   needed for FULLY IMPLEMENTED status.
 *
 * ADR: docs/architecture/agent-studio-active-graph-backend-decision.md
 * Workflow: .github/workflows/graph-bench-memgraph-fallback.yml
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
import { MEMGRAPH_CAPABILITIES } from "./capabilities.js";

export interface MemgraphGraphRepositoryOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  /** Memgraph supports multiple databases since 2.x. Defaults to "memgraph". */
  readonly database?: string;
}

export class MemgraphGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "memgraph";
  readonly capabilities: BackendCapabilities = MEMGRAPH_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly options: MemgraphGraphRepositoryOptions) {}

  // Skeleton methods — mirror Neo4j CE adapter shape. Real driver
  // calls land in the fallback-promotion operator-implementation PR.

  async localGraph(_seed: string, _options: TraversalOptions, _runtime: RuntimeContext) {
    return {
      nodes: [],
      edges: [],
      truncated: false,
      truncationReason: "memgraph adapter skeleton — fallback-promotion PR implements",
    };
  }

  async globalGraphSample(_options: TraversalOptions, _runtime: RuntimeContext) {
    return { nodes: [], edges: [], truncated: false };
  }

  async neighborhood(_id: string, _depth: number, _runtime: RuntimeContext) {
    return { nodes: [], edges: [] };
  }

  async shortestPath(_from: string, _to: string, _runtime: RuntimeContext): Promise<TraversalPath | null> {
    return null;
  }

  async upsertNode(_n: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields }) {}
  async upsertEdge(_e: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields }) {}
  async deleteNode(_id: string) {}
  async deleteEdge(_id: string) {}
  async applyProjectionJob(_w: ProjectionWrite[]): Promise<ProjectionResult> {
    return {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
      durationMs: 0,
      errors: [],
    };
  }

  async enqueueProjectionJob(_i: ProjectionSyncJobInput) {
    return { jobId: 0 };
  }
  async takeSnapshot(_s: string) {
    return { snapshotId: "" };
  }
  async detectDrift(_s: string) {
    return { driftEvents: [] };
  }
  async rebuildProjection(_s: string): Promise<ProjectionResult> {
    return {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
      durationMs: 0,
      errors: [],
    };
  }

  async executeTemplate(_i: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    return { rows: [], truncated: false, durationMs: 0, templateVersion: "memgraph-skeleton" };
  }

  async runAlgorithm(_i: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    return { rows: [], durationMs: 0 };
  }

  async filterByPermissions<T extends NodeIdentity>(nodes: T[], _r: RuntimeContext): Promise<T[]> {
    return nodes;
  }

  async isVisibleToUser(_id: string, _r: RuntimeContext): Promise<boolean> {
    return true;
  }

  async explainPath(_f: string, _t: string, _r: RuntimeContext) {
    return { path: null };
  }
  async explainNode(_id: string, _r: RuntimeContext) {
    return null;
  }

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

  async health(): Promise<BackendHealth> {
    return {
      status: "degraded",
      errors: ["memgraph driver not yet wired — fallback-promotion PR implements"],
      capabilities: this.capabilities,
    };
  }
}
