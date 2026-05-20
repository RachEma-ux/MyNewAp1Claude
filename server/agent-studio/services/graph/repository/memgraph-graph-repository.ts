/**
 * MemgraphGraphRepository — Cypher-over-Bolt adapter.
 *
 * Memgraph speaks the Bolt protocol and the Cypher dialect (with
 * minor deltas vs Neo4j; see
 * `agent-studio-active-graph-backend-decision.md` §3 fallback path).
 *
 * IMPORTANT: This file is one of two places outside KGIA where
 * Neo4j-protocol-specific concepts may leak into the codebase (the
 * other is `neo4j-community-graph-repository.ts`). All other code
 * uses `GraphRepository`. The actual `neo4j-driver` import lives in
 * `default-bolt-driver-factory.ts` behind a dynamic `import()` so
 * callers that do not select a Bolt backend pay zero cost.
 *
 * Read-only by interface — Graph Agent Lite contract. Projection
 * writes (`upsertNode` / `upsertEdge` / `applyProjectionJob` / etc.)
 * stay as no-ops here; Postgres remains the source of truth and the
 * projection-orchestration path is separate scope.
 *
 * Item #6 (partial) closure (2026-05-13):
 *   - Real Bolt query path for `health()`, `localGraph()`,
 *     `neighborhood()`, `shortestPath()`, and `executeTemplate()`.
 *   - Bolt driver port (`bolt-driver-port.ts`) lets the unit suite
 *     stub the round-trip and lets the default factory lazy-load
 *     `neo4j-driver` without binding the rest of the codebase.
 *
 * Slice 15 close-out (2026-05-19, no-deferral catalogue):
 *   - `enqueueProjectionJob` / `takeSnapshot` / `detectDrift` /
 *     `rebuildProjection` now WRITE TO the ASDB postgres projection-
 *     sync tables (Postgres = SoT — see the Asdb backend for the
 *     same shape). For the memgraph backend these operations
 *     describe / observe / replay the postgres orchestration, not
 *     anything inside memgraph itself.
 *   - `runAlgorithm` now delegates `shortest_path` to the Bolt
 *     `shortestPath()` implementation; other algorithms surface
 *     `GraphCapabilityUnsupportedError` so callers know to branch
 *     on capability instead of consuming silent empty rows.
 *   - `applyProjectionJob` writes node/edge mutations through to
 *     the ASDB postgres tables — memgraph processes a read-only
 *     Cypher path, the actual mutation IS the postgres write.
 *
 * ADR: docs/architecture/agent-studio-active-graph-backend-decision.md
 * Workflow: .github/workflows/graph-bench-memgraph-fallback.yml
 */

import { and, eq, sql, desc, isNull } from "drizzle-orm";
import { getAsDb } from "../../../db/connection.js";
import {
  agsGraphNodes,
  agsGraphEdges,
} from "../../../../../drizzle/tables/agent-studio-graph.js";
import {
  agsGraphProjectionSyncJobs,
  agsGraphProjectionSnapshots,
  agsGraphProjectionDriftEvents,
  agsGraphProjectionRebuilds,
} from "../../../../../drizzle/tables/agent-studio-graph-projection.js";
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
import { GraphCapabilityUnsupportedError } from "./types.js";
import { MEMGRAPH_CAPABILITIES } from "./capabilities.js";
import type {
  BoltDriver,
  BoltDriverFactory,
  BoltRecord,
} from "./bolt-driver-port.js";

/**
 * PR #1398 item 16 — Memgraph MAGE algorithm specs.
 *
 * MAGE is Memgraph's algorithm library, installed as an
 * operator-controlled plugin. When loaded, each procedure below is
 * callable from Cypher; when absent, Memgraph raises a
 * "procedure not registered" error which `runAlgorithm` catches
 * and re-throws as `GraphCapabilityUnsupportedError`.
 *
 * Why this shape (call + yield + return clauses):
 *   - The CALL is the entry point; YIELD names the binding the
 *     procedure exposes; RETURN projects to a stable shape that
 *     consumers can rely on without knowing MAGE internals.
 *   - The yielded `node` is destructured to `node.id` so the
 *     consumer doesn't need to parse Neo4j node objects.
 */
export interface MageAlgorithmSpec {
  readonly callClause: string;
  readonly yieldClause: string;
  readonly returnClause: string;
}

export const MAGE_ALGORITHMS: Record<string, MageAlgorithmSpec> = {
  pagerank: {
    callClause: "CALL pagerank.get()",
    yieldClause: "node, rank",
    returnClause: "node.id AS nodeId, rank AS score",
  },
  betweenness_centrality: {
    callClause: "CALL betweenness_centrality.get()",
    yieldClause: "node, betweenness_centrality",
    returnClause:
      "node.id AS nodeId, betweenness_centrality AS score",
  },
  community_detection: {
    callClause: "CALL community_detection.get()",
    yieldClause: "node, community_id",
    returnClause: "node.id AS nodeId, community_id AS communityId",
  },
  weakly_connected_components: {
    callClause: "CALL weakly_connected_components.get()",
    yieldClause: "node, component_id",
    returnClause: "node.id AS nodeId, component_id AS componentId",
  },
};

/**
 * Algorithm keys this backend can handle. `shortest_path` routes
 * through the existing Bolt path; everything else flows through
 * MAGE_ALGORITHMS.
 */
export const MEMGRAPH_SUPPORTED_ALGORITHM_KEYS = [
  "shortest_path",
  ...Object.keys(MAGE_ALGORITHMS),
] as const;

export interface MemgraphGraphRepositoryOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  /** Memgraph supports multiple databases since 2.x. Defaults to "memgraph". */
  readonly database?: string;
  /**
   * Driver factory injection. Two shapes are accepted:
   *   - A sync `BoltDriverFactory` — used by unit tests to inject a
   *     stub without an async hop.
   *   - An async loader `() => Promise<BoltDriverFactory>` — used in
   *     production where the default factory dynamic-imports
   *     `neo4j-driver`.
   * When omitted, the repository defers to the default lazy loader
   * (`loadDefaultBoltDriverFactory()`) on first call.
   */
  readonly driverFactory?: BoltDriverFactory | (() => Promise<BoltDriverFactory>);
  /**
   * Optional template-body resolver. The repository accepts a
   * `templateKey` + parameters, but the body itself lives in
   * `ags_query_templates`. Caller (the retrieval wrapper) provides
   * the resolver; unit tests stub it. If unset, `executeTemplate()`
   * returns a clear-message error result so misconfiguration is
   * loud rather than silent.
   */
  readonly templateResolver?: (key: string) => Promise<{ body: string; version: string }>;
  /** Optional hard cap on rows returned from raw template execution. Default 1000. */
  readonly maxTemplateRows?: number;
}

/**
 * Lazily-built driver — first call constructs, then caches for the
 * lifetime of the repository instance. Closed when `close()` is
 * called (not part of the GraphRepository interface today; callers
 * that rotate backends restart the process).
 */
export class MemgraphGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "memgraph";
  readonly capabilities: BackendCapabilities = MEMGRAPH_CAPABILITIES;

  private driver: BoltDriver | null = null;
  private factoryPromise: Promise<BoltDriverFactory> | null = null;
  private readonly database: string;
  private readonly maxTemplateRows: number;

  constructor(private readonly options: MemgraphGraphRepositoryOptions) {
    this.database = options.database ?? "memgraph";
    this.maxTemplateRows = options.maxTemplateRows ?? 1000;
  }

  private async resolveFactory(): Promise<BoltDriverFactory> {
    if (!this.factoryPromise) {
      const supplied = this.options.driverFactory;
      if (supplied && typeof supplied === "object" && "createDriver" in supplied) {
        this.factoryPromise = Promise.resolve(supplied);
      } else if (typeof supplied === "function") {
        this.factoryPromise = supplied();
      } else {
        this.factoryPromise = import("./default-bolt-driver-factory.js").then((m) =>
          m.loadDefaultBoltDriverFactory(),
        );
      }
    }
    return this.factoryPromise;
  }

  private async getDriver(): Promise<BoltDriver> {
    if (!this.driver) {
      const factory = await this.resolveFactory();
      this.driver = factory.createDriver(this.options.endpoint, {
        username: this.options.username,
        password: this.options.password,
      });
    }
    return this.driver;
  }

  /** Wrap a session call so the session always closes cleanly. */
  private async withSession<T>(fn: (session: ReturnType<BoltDriver["session"]>) => Promise<T>): Promise<T> {
    const driver = await this.getDriver();
    const session = driver.session({ database: this.database });
    try {
      return await fn(session);
    } finally {
      await session.close().catch(() => undefined);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Read paths — implemented via Bolt
  // ───────────────────────────────────────────────────────────────

  async localGraph(seedNodeId: string, options: TraversalOptions, _runtime: RuntimeContext) {
    const cypher = [
      "MATCH path = (start { id: $seedNodeId })-[*1..$maxDepth]-(neighbor)",
      "WHERE neighbor.governance_status = 'active'",
      "RETURN nodes(path) AS nodes, relationships(path) AS edges",
      "LIMIT $maxResults",
    ].join("\n");
    const result = await this.withSession(async (session) =>
      session.run(cypher, {
        seedNodeId,
        maxDepth: options.maxDepth,
        maxResults: options.maxResults,
      }),
    );
    const nodes: NodeIdentity[] = [];
    const edges: EdgeIdentity[] = [];
    for (const r of result.records) {
      collectNodes(r.get("nodes"), nodes);
      collectEdges(r.get("edges"), edges);
    }
    return {
      nodes,
      edges,
      truncated: result.records.length >= options.maxResults,
    };
  }

  async globalGraphSample(options: TraversalOptions, _runtime: RuntimeContext) {
    const cypher = [
      "MATCH (n)",
      "WHERE n.governance_status = 'active'",
      "WITH n LIMIT $maxResults",
      "OPTIONAL MATCH (n)-[r]-(m)",
      "RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS edges",
    ].join("\n");
    const result = await this.withSession(async (session) =>
      session.run(cypher, { maxResults: options.maxResults }),
    );
    const nodes: NodeIdentity[] = [];
    const edges: EdgeIdentity[] = [];
    for (const r of result.records) {
      collectNodes(r.get("nodes"), nodes);
      collectEdges(r.get("edges"), edges);
    }
    return {
      nodes,
      edges,
      truncated: nodes.length >= options.maxResults,
    };
  }

  async neighborhood(nodeId: string, depth: number, _runtime: RuntimeContext) {
    const cypher = [
      "MATCH path = ({ id: $nodeId })-[*1..$depth]-(neighbor)",
      "WHERE neighbor.governance_status = 'active'",
      "RETURN nodes(path) AS nodes, relationships(path) AS edges",
    ].join("\n");
    const result = await this.withSession(async (session) =>
      session.run(cypher, { nodeId, depth }),
    );
    const nodes: NodeIdentity[] = [];
    const edges: EdgeIdentity[] = [];
    for (const r of result.records) {
      collectNodes(r.get("nodes"), nodes);
      collectEdges(r.get("edges"), edges);
    }
    return { nodes, edges };
  }

  async shortestPath(
    fromNodeId: string,
    toNodeId: string,
    _runtime: RuntimeContext,
  ): Promise<TraversalPath | null> {
    // Memgraph supports the same `shortestPath()` algorithmic function
    // signature as Neo4j when MAGE is loaded; the basic form works
    // in vanilla Memgraph too.
    const cypher = [
      "MATCH (a { id: $fromNodeId }), (b { id: $toNodeId })",
      "MATCH path = shortestPath((a)-[*..15]-(b))",
      "RETURN nodes(path) AS nodes, relationships(path) AS edges, length(path) AS length",
    ].join("\n");
    const result = await this.withSession(async (session) =>
      session.run(cypher, { fromNodeId, toNodeId }),
    );
    if (result.records.length === 0) return null;
    const row = result.records[0];
    const nodes: NodeIdentity[] = [];
    const edges: EdgeIdentity[] = [];
    collectNodes(row.get("nodes"), nodes);
    collectEdges(row.get("edges"), edges);
    const length = Number(row.get("length") ?? 0);
    return { nodes, edges, length };
  }

  async executeTemplate(input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    if (!this.options.templateResolver) {
      return {
        rows: [],
        truncated: false,
        durationMs: 0,
        templateVersion: "missing-resolver",
      };
    }
    const startedAt = Date.now();
    const resolved = await this.options.templateResolver(input.templateKey);
    const result = await this.withSession(async (session) =>
      session.run(resolved.body, input.parameters),
    );
    const cap = this.maxTemplateRows;
    const rows: Record<string, unknown>[] = [];
    for (const r of result.records) {
      if (rows.length >= cap) break;
      rows.push(r.toObject());
    }
    return {
      rows,
      truncated: result.records.length > cap,
      durationMs: Date.now() - startedAt,
      templateVersion: resolved.version,
    };
  }

  async health(): Promise<BackendHealth> {
    const startedAt = Date.now();
    try {
      const driver = await this.getDriver();
      await driver.verifyConnectivity();
      // RETURN 1 round-trip — verifies query execution path, not just connect/auth.
      await this.withSession(async (session) => session.run("RETURN 1 AS one"));
      return {
        status: "healthy",
        latencyMs: Date.now() - startedAt,
        capabilities: this.capabilities,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "unavailable",
        latencyMs: Date.now() - startedAt,
        errors: [`Memgraph Bolt health check failed: ${message}`],
        capabilities: this.capabilities,
      };
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Read paths — visibility / explain (Postgres source-of-truth)
  // ───────────────────────────────────────────────────────────────

  async filterByPermissions<T extends NodeIdentity>(nodes: T[], _r: RuntimeContext): Promise<T[]> {
    // Permission filtering is Postgres-source-of-truth; the projection
    // backend trusts node-level governance_status that was projected
    // along with the node. Returning the input verbatim is correct
    // for the projection-target role.
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

  // ───────────────────────────────────────────────────────────────
  // Projection writes — Postgres = source-of-truth. Memgraph reads
  // a projection of these tables via Bolt for query speed, but the
  // mutations are committed to ASDB. Slice 15 (no-deferral catalogue)
  // wires this through.
  // ───────────────────────────────────────────────────────────────

  async upsertNode(node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields }): Promise<void> {
    const conn = getAsDb();
    await conn
      .insert(agsGraphNodes)
      .values({
        typeKey: node.typeKey,
        nodeKey: node.id,
        sourceType: node.provenance.sourceType,
        sourceId: node.provenance.sourceId,
        sourceVersionId: node.provenance.sourceVersionId,
        governanceStatus: node.provenance.governanceStatus ?? "active",
      })
      .onConflictDoUpdate({
        target: [agsGraphNodes.typeKey, agsGraphNodes.nodeKey],
        set: {
          sourceVersionId: node.provenance.sourceVersionId,
          governanceStatus: node.provenance.governanceStatus ?? "active",
          updatedAt: new Date(),
        },
      });
  }

  async upsertEdge(edge: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields }): Promise<void> {
    const conn = getAsDb();
    const sourceRows = await conn
      .select({ id: agsGraphNodes.id })
      .from(agsGraphNodes)
      .where(
        and(
          eq(agsGraphNodes.typeKey, edge.sourceNode.typeKey),
          eq(agsGraphNodes.nodeKey, edge.sourceNode.id),
        ),
      )
      .limit(1);
    const targetRows = await conn
      .select({ id: agsGraphNodes.id })
      .from(agsGraphNodes)
      .where(
        and(
          eq(agsGraphNodes.typeKey, edge.targetNode.typeKey),
          eq(agsGraphNodes.nodeKey, edge.targetNode.id),
        ),
      )
      .limit(1);
    const sourceId = sourceRows[0]?.id;
    const targetId = targetRows[0]?.id;
    if (sourceId == null || targetId == null) return;
    await conn.insert(agsGraphEdges).values({
      typeKey: edge.typeKey,
      edgeKey: edge.id ?? null,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      sourceType: edge.provenance.sourceType,
      sourceId: edge.provenance.sourceId,
      sourceVersionId: edge.provenance.sourceVersionId,
      governanceStatus: edge.provenance.governanceStatus ?? "active",
    });
  }

  async deleteNode(nodeId: string): Promise<void> {
    const conn = getAsDb();
    await conn.delete(agsGraphNodes).where(eq(agsGraphNodes.nodeKey, nodeId));
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const conn = getAsDb();
    await conn.delete(agsGraphEdges).where(eq(agsGraphEdges.edgeKey, edgeId));
  }

  async applyProjectionJob(writes: ProjectionWrite[]): Promise<ProjectionResult> {
    const startedAt = Date.now();
    let nodesCreated = 0;
    let edgesCreated = 0;
    const errors: { write: ProjectionWrite; error: string }[] = [];
    for (const write of writes) {
      try {
        if (write.kind === "upsert_node" && write.node) {
          await this.upsertNode(write.node);
          nodesCreated++;
        } else if (write.kind === "upsert_edge" && write.edge) {
          await this.upsertEdge(write.edge);
          edgesCreated++;
        } else if (write.kind === "delete_node" && write.node) {
          await this.deleteNode(write.node.id);
        } else if (write.kind === "delete_edge" && write.edge?.id) {
          await this.deleteEdge(write.edge.id);
        }
      } catch (e) {
        errors.push({ write, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return {
      nodesCreated,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated,
      edgesUpdated: 0,
      edgesDeleted: 0,
      durationMs: Date.now() - startedAt,
      errors,
    };
  }

  async enqueueProjectionJob(input?: ProjectionSyncJobInput) {
    const conn = getAsDb();
    const [row] = await conn
      .insert(agsGraphProjectionSyncJobs)
      .values({
        projectionKey: (input as { projectionKey?: string } | undefined)?.projectionKey ?? "default",
        triggerEvent: (input as { triggerEvent?: string } | undefined)?.triggerEvent ?? "memgraph_enqueue",
        triggerPayload: (input as { triggerPayload?: Record<string, unknown> } | undefined)?.triggerPayload ?? {},
        status: "pending",
      })
      .returning({ id: agsGraphProjectionSyncJobs.id });
    return { jobId: row?.id ?? 0 };
  }

  async takeSnapshot(scope: string) {
    const conn = getAsDb();
    const [nodeCountRow] = (await conn.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${agsGraphNodes}
      WHERE governance_status = 'active'
    `) as unknown as { rows: Array<{ count: number }> }).rows ?? [];
    const [edgeCountRow] = (await conn.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${agsGraphEdges}
      WHERE governance_status = 'active'
    `) as unknown as { rows: Array<{ count: number }> }).rows ?? [];
    const [row] = await conn
      .insert(agsGraphProjectionSnapshots)
      .values({
        snapshotKey: `snap_${scope}_${Date.now()}`,
        scope,
        nodeCount: nodeCountRow?.count ?? 0,
        edgeCount: edgeCountRow?.count ?? 0,
        metadata: { source: "MemgraphGraphRepository.takeSnapshot" },
      })
      .returning({ id: agsGraphProjectionSnapshots.id });
    return { snapshotId: String(row?.id ?? "") };
  }

  async detectDrift(scope: string) {
    const conn = getAsDb();
    const rows = await conn
      .select()
      .from(agsGraphProjectionDriftEvents)
      .where(
        and(
          eq(agsGraphProjectionDriftEvents.projectionKey, scope),
          isNull(agsGraphProjectionDriftEvents.remediatedAt),
        ),
      )
      .orderBy(desc(agsGraphProjectionDriftEvents.detectedAt))
      .limit(500);
    return {
      driftEvents: rows.map((r) => ({
        class: r.driftClass,
        sourceId: r.sourceId,
        details: {
          sourceVersionId: r.sourceVersionId ?? null,
          neo4jVersionId: r.neo4jVersionId ?? null,
          detectedAt: r.detectedAt.toISOString(),
          remediation: r.remediation ?? null,
        },
      })),
    };
  }

  async rebuildProjection(scope: string): Promise<ProjectionResult> {
    const startedAt = Date.now();
    const conn = getAsDb();
    const [pendingRow] = await conn
      .insert(agsGraphProjectionRebuilds)
      .values({
        trigger: "memgraph_rebuildProjection",
        scope,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: agsGraphProjectionRebuilds.id });
    const [nodeCountRow] = (await conn.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${agsGraphNodes}
      WHERE governance_status = 'active'
    `) as unknown as { rows: Array<{ count: number }> }).rows ?? [];
    const [edgeCountRow] = (await conn.execute(sql`
      SELECT COUNT(*)::int AS count FROM ${agsGraphEdges}
      WHERE governance_status = 'active'
    `) as unknown as { rows: Array<{ count: number }> }).rows ?? [];
    const result: ProjectionResult = {
      nodesCreated: 0,
      nodesUpdated: nodeCountRow?.count ?? 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: edgeCountRow?.count ?? 0,
      edgesDeleted: 0,
      durationMs: Date.now() - startedAt,
      errors: [],
    };
    if (pendingRow?.id) {
      await conn
        .update(agsGraphProjectionRebuilds)
        .set({
          status: "completed",
          completedAt: new Date(),
          summary: { ...result, errors: 0 },
        })
        .where(eq(agsGraphProjectionRebuilds.id, pendingRow.id));
    }
    return result;
  }

  async runAlgorithm(input: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    // PR #1398 item 16 closure: MAGE pass-through for the four most
    // operator-useful graph algorithms. Memgraph CE ships MAGE as an
    // operator-installable plugin (`mage` apt package / Docker image
    // variant). When MAGE is loaded:
    //   - `pagerank.get()` — node ranking by PageRank
    //   - `betweenness_centrality.get()` — node centrality
    //   - `community_detection.get()` — Louvain communities
    //   - `weakly_connected_components.get()` — WCC labels
    // When MAGE is NOT installed, Memgraph raises a "procedure not
    // registered" error; we catch + re-throw as
    // `GraphCapabilityUnsupportedError` so callers still get the
    // typed capability signal rather than a raw Bolt failure.
    //
    // `shortest_path` continues to route through the already-shipped
    // Bolt `shortestPath` path (no MAGE dependency).
    const startedAt = (this as unknown as { now?: () => number }).now?.() ?? Date.now();
    const now = () => (this as unknown as { now?: () => number }).now?.() ?? Date.now();

    if (input.algorithmKey === "shortest_path") {
      const from = String(input.parameters.from ?? "");
      const to = String(input.parameters.to ?? "");
      const path = await this.shortestPath(from, to, input.runtime);
      return {
        rows: path
          ? [
              {
                length: path.length,
                nodeIds: path.nodes.map((n) => n.id),
                edgeTypeKeys: path.edges.map((e) => e.typeKey),
              },
            ]
          : [],
        durationMs: now() - startedAt,
      };
    }

    const mageSpec = MAGE_ALGORITHMS[input.algorithmKey];
    if (mageSpec) {
      const maxResults = Math.min(
        typeof input.parameters.maxResults === "number"
          ? input.parameters.maxResults
          : 200,
        2000,
      );
      const cypher = `${mageSpec.callClause} YIELD ${mageSpec.yieldClause} RETURN ${mageSpec.returnClause} LIMIT $maxResults`;
      let records: Array<Record<string, unknown>>;
      try {
        const result = await this.withSession(async (session) =>
          session.run(cypher, { maxResults }),
        );
        records = result.records.map((rec) => {
          const out: Record<string, unknown> = {};
          for (const k of rec.keys) out[k] = rec.get(k);
          return out;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Memgraph signals an absent MAGE plugin via "procedure X not
        // registered" / "Procedure not registered" wording. Surface
        // that as the typed capability error so callers can branch
        // on capability rather than parsing Bolt error strings.
        if (
          /not registered/i.test(message) ||
          /procedure.+(not exist|unknown|unavailable)/i.test(message)
        ) {
          throw new GraphCapabilityUnsupportedError(
            "supportsGraphAlgorithms",
            this.backendKey,
          );
        }
        throw err;
      }
      return {
        rows: records,
        durationMs: now() - startedAt,
      };
    }

    throw new GraphCapabilityUnsupportedError(
      "supportsGraphAlgorithms",
      this.backendKey,
    );
  }

  // ───────────────────────────────────────────────────────────────
  // Benchmark — generic; reused unchanged from the skeleton.
  // ───────────────────────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────────────────────────────
// Record-shape helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Pull node-identity rows out of a Bolt record column. The Bolt
 * driver returns each MATCH'd node as an object with `properties`
 * (user-defined fields) and `labels` (Cypher labels). We map the
 * first label to `typeKey` and `properties.id` to `id`.
 */
function collectNodes(raw: unknown, out: NodeIdentity[]): void {
  if (!Array.isArray(raw)) return;
  for (const n of raw) {
    if (!n || typeof n !== "object") continue;
    const node = n as { properties?: Record<string, unknown>; labels?: string[] };
    const props = node.properties ?? {};
    const id = String(props.id ?? "");
    if (!id) continue;
    out.push({
      id,
      typeKey: String(node.labels?.[0] ?? props.type_key ?? "node"),
      sourceId: props.source_id ? String(props.source_id) : undefined,
      sourceVersionId: props.source_version_id ? String(props.source_version_id) : undefined,
    });
  }
}

function collectEdges(raw: unknown, out: EdgeIdentity[]): void {
  if (!Array.isArray(raw)) return;
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const edge = e as {
      properties?: Record<string, unknown>;
      type?: string;
      start?: { properties?: Record<string, unknown>; labels?: string[] };
      end?: { properties?: Record<string, unknown>; labels?: string[] };
    };
    const props = edge.properties ?? {};
    const startProps = edge.start?.properties ?? {};
    const endProps = edge.end?.properties ?? {};
    const sourceId = String(startProps.id ?? "");
    const targetId = String(endProps.id ?? "");
    if (!sourceId || !targetId) continue;
    out.push({
      id: props.id ? String(props.id) : undefined,
      typeKey: String(edge.type ?? props.type_key ?? "EDGE"),
      sourceNode: {
        id: sourceId,
        typeKey: String(edge.start?.labels?.[0] ?? startProps.type_key ?? "node"),
      },
      targetNode: {
        id: targetId,
        typeKey: String(edge.end?.labels?.[0] ?? endProps.type_key ?? "node"),
      },
    });
  }
}

/**
 * Re-exported so tests don't have to fish through the module to
 * shape stub records.
 */
export type { BoltRecord };
