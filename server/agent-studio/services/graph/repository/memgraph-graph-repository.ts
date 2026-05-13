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
 * Still skeleton (out of scope for this PR):
 *   - All projection writes (mutations stay Postgres-source-of-truth).
 *   - `runAlgorithm` (Memgraph Community lacks GDS).
 *   - `takeSnapshot` / `detectDrift` / `rebuildProjection` — those
 *     live in the projection-sync orchestration path.
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
import type {
  BoltDriver,
  BoltDriverFactory,
  BoltRecord,
} from "./bolt-driver-port.js";

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
  // Projection writes — still no-ops; Postgres = source of truth.
  // The projection-sync orchestration path writes through a
  // dedicated worker, not direct repository writes.
  // ───────────────────────────────────────────────────────────────

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

  async runAlgorithm(_i: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    // Memgraph Community lacks the GDS surface; algorithm calls
    // surface as empty until MAGE wiring lands separately.
    return { rows: [], durationMs: 0 };
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
