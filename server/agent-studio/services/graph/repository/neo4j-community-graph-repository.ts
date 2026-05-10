/**
 * Neo4jCommunityGraphRepository — wraps KGIA's existing Neo4j adapter.
 *
 * SKELETON. Phase 7.5 hardens this into the active backend by:
 *   1. Wiring the real `neo4j-driver` (currently stubbed in
 *      server/modules/kgia/infrastructure/neo4j-adapter.ts).
 *   2. Implementing all GraphRepository sub-interfaces.
 *   3. Adding the Cypher template registry execution path.
 *   4. Adding health check + degraded mode fallback.
 *
 * IMPORTANT: This file is the ONLY place outside KGIA where Neo4j-specific
 * concepts may leak into the codebase. All other code uses GraphRepository.
 *
 * ADR: docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md
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
import { NEO4J_CE_CAPABILITIES } from "./capabilities.js";

export interface Neo4jCommunityGraphRepositoryOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  readonly database?: string;
}

export class Neo4jCommunityGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "neo4j-ce";
  readonly capabilities: BackendCapabilities = NEO4J_CE_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly options: Neo4jCommunityGraphRepositoryOptions) {}

  // Phase 7.5: replace these stubs with actual neo4j-driver session calls,
  // wrapping the existing KGIA neo4j-adapter primitives.

  async localGraph(_seed: string, _options: TraversalOptions, _runtime: RuntimeContext) {
    // Phase 7.5:
    //   const session = driver.session({ database });
    //   const cypher = `
    //     MATCH path=(start { id: $seed })-[*1..$maxDepth]-(neighbor)
    //     WHERE neighbor.governance_status = 'active'
    //     RETURN nodes(path), relationships(path)
    //     LIMIT $maxResults
    //   `;
    return { nodes: [], edges: [], truncated: false, truncationReason: "neo4j-ce skeleton — Phase 7.5 implements" };
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
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  async enqueueProjectionJob(_i: ProjectionSyncJobInput) { return { jobId: 0 }; }
  async takeSnapshot(_s: string) { return { snapshotId: "" }; }
  async detectDrift(_s: string) { return { driftEvents: [] }; }
  async rebuildProjection(_s: string): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  async executeTemplate(_i: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    return { rows: [], truncated: false, durationMs: 0, templateVersion: "skeleton" };
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

  async explainPath(_f: string, _t: string, _r: RuntimeContext) { return { path: null }; }
  async explainNode(_id: string, _r: RuntimeContext) { return null; }

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
    // Phase 7.5: real driver.verifyConnectivity() + db.ping().
    return {
      status: "degraded",
      errors: ["neo4j-ce driver not yet wired (Phase 7.5)"],
      capabilities: this.capabilities,
    };
  }
}
