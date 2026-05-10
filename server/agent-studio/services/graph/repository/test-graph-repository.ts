/**
 * TestGraphRepository — in-memory implementation for tests + dev-mode UI.
 *
 * Behavior is deterministic: BFS traversal, no async I/O.
 *
 * Used by:
 *   - tests/agent-studio/graph-*.test.ts
 *   - dev-mode UI before Neo4j CE is wired
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
import { TEST_CAPABILITIES } from "./capabilities.js";

interface StoredNode {
  identity: NodeIdentity;
  properties: NodeProperties;
  provenance: ProvenanceFields;
}

interface StoredEdge {
  identity: EdgeIdentity;
  properties: EdgeProperties;
  provenance: ProvenanceFields;
}

export class TestGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "test";
  readonly capabilities: BackendCapabilities = TEST_CAPABILITIES;

  private readonly nodes = new Map<string, StoredNode>();
  private readonly edges = new Map<string, StoredEdge>();
  private readonly outgoing = new Map<string, Set<string>>(); // sourceNodeId -> edgeIds
  private readonly incoming = new Map<string, Set<string>>();
  private readonly snapshots = new Map<string, { nodes: StoredNode[]; edges: StoredEdge[] }>();
  private snapshotCounter = 0;
  private nextEdgeAutoId = 1;

  // ----- Traversal -----

  async localGraph(seedNodeId: string, options: TraversalOptions, runtime: RuntimeContext) {
    const visitedNodes = new Map<string, NodeIdentity>();
    const visitedEdges = new Map<string, EdgeIdentity>();
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: seedNodeId, depth: 0 }];

    while (queue.length > 0 && visitedNodes.size < options.maxResults) {
      const { nodeId, depth } = queue.shift()!;
      if (visitedNodes.has(nodeId)) continue;
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      if (!this.passesPermissionAndType(node, options, runtime)) continue;
      visitedNodes.set(nodeId, node.identity);
      if (depth >= options.maxDepth) continue;

      const out = this.outgoing.get(nodeId);
      if (out) {
        for (const edgeId of out) {
          const edge = this.edges.get(edgeId);
          if (!edge) continue;
          if (options.edgeTypeFilter && !options.edgeTypeFilter.includes(edge.identity.typeKey)) continue;
          const targetId = edge.identity.targetNode.id;
          visitedEdges.set(edgeId, edge.identity);
          if (!visitedNodes.has(targetId)) queue.push({ nodeId: targetId, depth: depth + 1 });
        }
      }
    }

    const truncated = visitedNodes.size >= options.maxResults;
    return {
      nodes: Array.from(visitedNodes.values()),
      edges: Array.from(visitedEdges.values()),
      truncated,
      truncationReason: truncated ? "maxResults reached" : undefined,
    };
  }

  async globalGraphSample(options: TraversalOptions, runtime: RuntimeContext) {
    const sampleNodes: NodeIdentity[] = [];
    const sampleEdges: EdgeIdentity[] = [];
    for (const node of this.nodes.values()) {
      if (sampleNodes.length >= options.maxResults) break;
      if (!this.passesPermissionAndType(node, options, runtime)) continue;
      sampleNodes.push(node.identity);
    }
    for (const edge of this.edges.values()) {
      if (sampleEdges.length >= options.maxResults) break;
      if (options.edgeTypeFilter && !options.edgeTypeFilter.includes(edge.identity.typeKey)) continue;
      sampleEdges.push(edge.identity);
    }
    return {
      nodes: sampleNodes,
      edges: sampleEdges,
      truncated: this.nodes.size > options.maxResults,
    };
  }

  async neighborhood(nodeId: string, depth: number, runtime: RuntimeContext) {
    const result = await this.localGraph(nodeId, { maxDepth: depth, maxResults: 1000 }, runtime);
    return { nodes: result.nodes, edges: result.edges };
  }

  async shortestPath(fromNodeId: string, toNodeId: string, runtime: RuntimeContext): Promise<TraversalPath | null> {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;
    const parent = new Map<string, { parentId: string; edge: EdgeIdentity } | null>();
    parent.set(fromNodeId, null);
    const queue: string[] = [fromNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === toNodeId) break;
      const out = this.outgoing.get(current);
      if (!out) continue;
      for (const edgeId of out) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;
        const targetId = edge.identity.targetNode.id;
        if (!parent.has(targetId)) {
          parent.set(targetId, { parentId: current, edge: edge.identity });
          queue.push(targetId);
        }
      }
    }
    if (!parent.has(toNodeId)) return null;
    const nodes: NodeIdentity[] = [];
    const edges: EdgeIdentity[] = [];
    let cursor: string | null = toNodeId;
    while (cursor) {
      const node = this.nodes.get(cursor);
      if (!node) return null;
      nodes.unshift(node.identity);
      const edgeRec = parent.get(cursor);
      if (!edgeRec) break;
      edges.unshift(edgeRec.edge);
      cursor = edgeRec.parentId;
    }
    return { nodes, edges, length: edges.length };
  }

  // ----- Projection -----

  async upsertNode(node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields }) {
    this.nodes.set(node.id, { identity: { typeKey: node.typeKey, id: node.id, sourceId: node.sourceId, sourceVersionId: node.sourceVersionId }, properties: node.properties, provenance: node.provenance });
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, new Set());
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, new Set());
  }

  async upsertEdge(edge: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields }) {
    const edgeId = edge.id ?? `edge_${this.nextEdgeAutoId++}`;
    const stored: StoredEdge = { identity: { ...edge, id: edgeId }, properties: edge.properties, provenance: edge.provenance };
    this.edges.set(edgeId, stored);
    if (!this.outgoing.has(edge.sourceNode.id)) this.outgoing.set(edge.sourceNode.id, new Set());
    if (!this.incoming.has(edge.targetNode.id)) this.incoming.set(edge.targetNode.id, new Set());
    this.outgoing.get(edge.sourceNode.id)!.add(edgeId);
    this.incoming.get(edge.targetNode.id)!.add(edgeId);
  }

  async deleteNode(nodeId: string) {
    this.nodes.delete(nodeId);
    const outIds = this.outgoing.get(nodeId);
    if (outIds) for (const id of outIds) this.edges.delete(id);
    const inIds = this.incoming.get(nodeId);
    if (inIds) for (const id of inIds) this.edges.delete(id);
    this.outgoing.delete(nodeId);
    this.incoming.delete(nodeId);
  }

  async deleteEdge(edgeId: string) {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    this.edges.delete(edgeId);
    this.outgoing.get(edge.identity.sourceNode.id)?.delete(edgeId);
    this.incoming.get(edge.identity.targetNode.id)?.delete(edgeId);
  }

  async applyProjectionJob(writes: ProjectionWrite[]): Promise<ProjectionResult> {
    const startedAt = Date.now();
    let nodesCreated = 0, nodesUpdated = 0, nodesDeleted = 0, edgesCreated = 0, edgesUpdated = 0, edgesDeleted = 0;
    const errors: { write: ProjectionWrite; error: string }[] = [];
    for (const write of writes) {
      try {
        if (write.kind === "upsert_node" && write.node) {
          const existed = this.nodes.has(write.node.id);
          await this.upsertNode(write.node);
          existed ? nodesUpdated++ : nodesCreated++;
        } else if (write.kind === "upsert_edge" && write.edge) {
          const id = write.edge.id;
          const existed = id ? this.edges.has(id) : false;
          await this.upsertEdge(write.edge);
          existed ? edgesUpdated++ : edgesCreated++;
        } else if (write.kind === "delete_node" && write.node) {
          await this.deleteNode(write.node.id);
          nodesDeleted++;
        } else if (write.kind === "delete_edge" && write.edge?.id) {
          await this.deleteEdge(write.edge.id);
          edgesDeleted++;
        }
      } catch (e) {
        errors.push({ write, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { nodesCreated, nodesUpdated, nodesDeleted, edgesCreated, edgesUpdated, edgesDeleted, durationMs: Date.now() - startedAt, errors };
  }

  // ----- Projection sync -----

  async enqueueProjectionJob(_input: ProjectionSyncJobInput): Promise<{ jobId: number }> {
    return { jobId: 0 }; // test backend doesn't queue; caller drives apply directly
  }

  async takeSnapshot(scope: string): Promise<{ snapshotId: string }> {
    const snapshotId = `snap_${++this.snapshotCounter}_${scope}`;
    this.snapshots.set(snapshotId, {
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n })),
      edges: Array.from(this.edges.values()).map((e) => ({ ...e })),
    });
    return { snapshotId };
  }

  async detectDrift(_scope: string) {
    return { driftEvents: [] };
  }

  async rebuildProjection(_scope: string): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  // ----- Query templates -----

  async executeTemplate(_input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    return { rows: [], truncated: false, durationMs: 0, templateVersion: "test" };
  }

  // ----- Algorithms -----

  async runAlgorithm(_input: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    return { rows: [], durationMs: 0 };
  }

  // ----- Permissions -----

  async filterByPermissions<T extends NodeIdentity>(nodes: T[], runtime: RuntimeContext): Promise<T[]> {
    return nodes.filter((n) => {
      const stored = this.nodes.get(n.id);
      if (!stored) return false;
      const status = stored.provenance.governanceStatus ?? "active";
      if (runtime.governanceStatusFilter && !runtime.governanceStatusFilter.includes(status)) return false;
      if (status === "hidden") return false;
      return true;
    });
  }

  async isVisibleToUser(nodeId: string, runtime: RuntimeContext): Promise<boolean> {
    const filtered = await this.filterByPermissions([{ typeKey: "", id: nodeId }], runtime);
    return filtered.length > 0;
  }

  // ----- Explain -----

  async explainPath(fromNodeId: string, toNodeId: string, runtime: RuntimeContext) {
    const path = await this.shortestPath(fromNodeId, toNodeId, runtime);
    return { path };
  }

  async explainNode(nodeId: string, _runtime: RuntimeContext) {
    const stored = this.nodes.get(nodeId);
    if (!stored) return null;
    return { node: stored.identity, properties: stored.properties, provenance: stored.provenance };
  }

  // ----- Benchmark -----

  async runBenchmark(scenario: BenchmarkScenario, iterations: number): Promise<BenchmarkResult> {
    const samples: number[] = [];
    let resultCount = 0;
    for (let i = 0; i < iterations; i++) {
      const result = await scenario.run(this);
      samples.push(result.durationMs);
      resultCount = result.resultCount;
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
    return { status: "healthy", latencyMs: 0, capabilities: this.capabilities };
  }

  // ----- Test helpers -----

  /** Test-only: count stored nodes. */
  _nodeCount(): number {
    return this.nodes.size;
  }

  /** Test-only: count stored edges. */
  _edgeCount(): number {
    return this.edges.size;
  }

  /** Test-only: clear all state. */
  _reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.snapshots.clear();
    this.snapshotCounter = 0;
    this.nextEdgeAutoId = 1;
  }

  // ----- Internal helpers -----

  private passesPermissionAndType(
    node: StoredNode,
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): boolean {
    if (options.nodeTypeFilter && !options.nodeTypeFilter.includes(node.identity.typeKey)) return false;
    const status = node.provenance.governanceStatus ?? "active";
    if (runtime.governanceStatusFilter && !runtime.governanceStatusFilter.includes(status)) return false;
    if (status === "hidden" && !runtime.governanceStatusFilter?.includes("hidden")) return false;
    return true;
  }
}
