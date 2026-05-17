/**
 * Neo4jCommunityGraphRepository — wraps KGIA's wired Neo4j adapter.
 *
 * Phase 7.5b (2026-05-17): implements the two production-critical
 * surfaces — `executeTemplate` (Cypher query template execution
 * via ASDB-resolved template registry) and `applyProjectionJob`
 * (batched UNWIND projection writes per the T-E.5 finding that
 * naive per-statement MERGE doesn't scale).
 *
 * Pre-7.5b: every method returned hardcoded empty results + the
 * file's docblock said "Phase 7.5 implements". Pre-7.5a, the
 * underlying KGIA adapter was also stubbed; Phase 7.5a wired it
 * to real `neo4j-driver`. Phase 7.5b adds the repository surface
 * that callers (T-F.3 Impact Analysis, T-G.2 Code Intelligence
 * projection writes) need.
 *
 * Boundary preserved (CLAUDE.md hard rule):
 *   - This file does NOT import `neo4j-driver`. All driver access
 *     routes through KGIA's `executeNeo4jQuery` (read) and
 *     `executeNeo4jWrite` (write, added in 7.5b). The repository
 *     is the single GraphRepository entry point; KGIA's adapter
 *     is the single neo4j-driver chokepoint.
 *   - Postgres remains source-of-truth: `applyProjectionJob`
 *     writes to Neo4j ONLY (caller is responsible for the
 *     ASDB-side write happening first).
 *
 * ADRs:
 *   - docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md
 *   - docs/architecture/agent-studio-phase-7-5-neo4j-blocker.md (§2 unblock sequence)
 *   - docs/implementation/agent-studio-code-graph-parser-spike-measurement-2026-05-17.md (§7.3 carry-forward: batched UNWIND mandate)
 */

import {
  executeNeo4jQuery,
  executeNeo4jWrite,
  testNeo4jConnection,
} from "../../../../modules/kgia/infrastructure/neo4j-adapter.js";
import type { GraphSource } from "../../../../modules/kgia/domain/types.js";

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

/**
 * Resolves a query template by its `templateKey`. Caller wires
 * this to ASDB (`ags_query_templates`) — typically a Drizzle
 * select. Keeping it as an injected callback avoids coupling
 * the repository to Drizzle and keeps it test-friendly.
 *
 * Return `null` when the key isn't found; the repository surfaces
 * the not-found case as an empty `rows` result with truncated=false.
 */
export interface QueryTemplateResolver {
  (templateKey: string): Promise<QueryTemplateRecord | null>;
}

export interface QueryTemplateRecord {
  readonly cypherBody: string;
  readonly maxResults: number;
  readonly timeoutMs: number;
  readonly permissionFilterRequired: boolean;
  readonly version: string;
}

export interface Neo4jCommunityGraphRepositoryOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  readonly database?: string;
  /**
   * ASDB-backed template resolver (Phase 7.5b). Optional so
   * tests / G3 benchmark can construct the repository without
   * the full ASDB stack; when undefined, `executeTemplate`
   * returns an empty-rows result with `templateVersion: "no-resolver"`.
   */
  readonly templateResolver?: QueryTemplateResolver;
}

/**
 * Batch size for projection UNWIND writes. 1000 is the standard
 * Neo4j scaling sweet spot — small enough to avoid bolt-frame
 * limits, large enough to amortize round-trip cost.
 *
 * T-E.5 finding: per-statement MERGE writes at 12449 edges took
 * 38 seconds (3.8× over the spike doc §4 < 10s gate). Batched at
 * 1000 expects ~12 round-trips × ~3ms each + Cypher exec time;
 * 100-300× speedup is typical for this pattern.
 */
const PROJECTION_BATCH_SIZE = 1000;

export class Neo4jCommunityGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "neo4j-ce";
  readonly capabilities: BackendCapabilities = NEO4J_CE_CAPABILITIES;

  constructor(private readonly options: Neo4jCommunityGraphRepositoryOptions) {}

  /**
   * Adapts the constructor options into the `GraphSource` shape
   * the KGIA adapter expects. Centralized so all driver-using
   * paths share the same config translation.
   */
  private graphSource(): GraphSource {
    return {
      endpoint: this.options.endpoint,
      credentials: {
        username: this.options.username,
        password: this.options.password,
        database: this.options.database ?? "neo4j",
      },
    } as unknown as GraphSource;
  }

  async localGraph(_seed: string, _options: TraversalOptions, _runtime: RuntimeContext) {
    return { nodes: [], edges: [], truncated: false, truncationReason: "neo4j-ce skeleton — Phase 7.6 implements localGraph traversal" };
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

  async upsertNode(
    node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields },
  ) {
    // Single-node convenience wrapper around applyProjectionJob.
    // Production callers should batch via applyProjectionJob; this
    // method exists for low-volume one-off writes.
    await this.applyProjectionJob([{ kind: "upsert_node", node }]);
  }

  async upsertEdge(
    edge: EdgeIdentity & { properties: EdgeProperties; provenance: ProvenanceFields },
  ) {
    await this.applyProjectionJob([{ kind: "upsert_edge", edge }]);
  }

  async deleteNode(id: string) {
    await this.applyProjectionJob([
      {
        kind: "delete_node",
        node: { typeKey: "_any", id } as NodeIdentity & {
          properties: NodeProperties;
          provenance: ProvenanceFields;
        },
      },
    ]);
  }

  async deleteEdge(id: string) {
    await this.applyProjectionJob([
      {
        kind: "delete_edge",
        edge: {
          typeKey: "_any",
          id,
          sourceNode: { typeKey: "_any", id: "" },
          targetNode: { typeKey: "_any", id: "" },
        } as EdgeIdentity & {
          properties: EdgeProperties;
          provenance: ProvenanceFields;
        },
      },
    ]);
  }

  /**
   * Phase 7.5b — batched UNWIND projection writes.
   *
   * Groups writes by (kind, typeKey) so each UNWIND batch uses a
   * static Cypher label/relationship-type (Neo4j requires labels
   * to be statically resolvable; dynamic labels need APOC).
   * Splits each group into PROJECTION_BATCH_SIZE chunks.
   *
   * Per T-E.5 §7.3 carry-forward: this is the production batched
   * pattern the spike's per-statement MERGE didn't use.
   */
  async applyProjectionJob(writes: ProjectionWrite[]): Promise<ProjectionResult> {
    const t0 = Date.now();
    const source = this.graphSource();
    const result = {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
      durationMs: 0,
      errors: [] as { write: ProjectionWrite; error: string }[],
    };

    // Bucket by (kind, typeKey) so the batched UNWIND can MERGE
    // against a static label / relationship type.
    const buckets = new Map<string, ProjectionWrite[]>();
    for (const w of writes) {
      const typeKey =
        w.kind === "upsert_node" || w.kind === "delete_node"
          ? w.node?.typeKey ?? "_unknown"
          : w.edge?.typeKey ?? "_unknown";
      const key = `${w.kind}|${typeKey}`;
      const arr = buckets.get(key) ?? [];
      arr.push(w);
      buckets.set(key, arr);
    }

    for (const [bucketKey, group] of buckets) {
      const [kind, typeKey] = bucketKey.split("|");
      const sanitizedLabel = sanitizeNeo4jIdentifier(typeKey ?? "_unknown");
      // Chunk the group into PROJECTION_BATCH_SIZE batches.
      for (let i = 0; i < group.length; i += PROJECTION_BATCH_SIZE) {
        const batch = group.slice(i, i + PROJECTION_BATCH_SIZE);
        try {
          switch (kind) {
            case "upsert_node":
              await this.batchUpsertNodes(source, sanitizedLabel, batch, result);
              break;
            case "upsert_edge":
              await this.batchUpsertEdges(source, sanitizedLabel, batch, result);
              break;
            case "delete_node":
              await this.batchDeleteNodes(source, batch, result);
              break;
            case "delete_edge":
              await this.batchDeleteEdges(source, batch, result);
              break;
            default:
              break;
          }
        } catch (err) {
          for (const w of batch) {
            result.errors.push({ write: w, error: (err as Error).message });
          }
        }
      }
    }

    return { ...result, durationMs: Date.now() - t0 };
  }

  private async batchUpsertNodes(
    source: GraphSource,
    label: string,
    batch: ProjectionWrite[],
    result: { nodesCreated: number; nodesUpdated: number },
  ): Promise<void> {
    const rows = batch.map((w) => ({
      id: w.node?.id ?? "",
      sourceId: w.node?.sourceId ?? null,
      sourceVersionId: w.node?.sourceVersionId ?? null,
      properties: w.node?.properties ?? {},
    }));
    const cypher = `
      UNWIND $rows AS row
      MERGE (n:\`${label}\` { id: row.id })
      ON CREATE SET n.created_at = timestamp(), n._created = true
      ON MATCH SET n._created = false
      SET n.source_id = row.sourceId,
          n.source_version_id = row.sourceVersionId,
          n += row.properties,
          n.updated_at = timestamp()
      WITH n
      RETURN sum(CASE WHEN n._created THEN 1 ELSE 0 END) AS created,
             sum(CASE WHEN n._created THEN 0 ELSE 1 END) AS updated
    `;
    const out = await executeNeo4jWrite(source, cypher, { rows });
    const first = out.records[0];
    if (first) {
      result.nodesCreated += toInt(first.created);
      result.nodesUpdated += toInt(first.updated);
    }
  }

  private async batchUpsertEdges(
    source: GraphSource,
    relType: string,
    batch: ProjectionWrite[],
    result: { edgesCreated: number; edgesUpdated: number },
  ): Promise<void> {
    const rows = batch.map((w) => ({
      id: w.edge?.id ?? null,
      sourceId: w.edge?.sourceNode.id ?? "",
      targetId: w.edge?.targetNode.id ?? "",
      properties: w.edge?.properties ?? {},
    }));
    // MERGE the relationship; ON CREATE / ON MATCH split tracks the
    // create-vs-update counts for the ProjectionResult.
    const cypher = `
      UNWIND $rows AS row
      MATCH (s { id: row.sourceId })
      MATCH (t { id: row.targetId })
      MERGE (s)-[r:\`${relType}\`]->(t)
      ON CREATE SET r.created_at = timestamp(), r._created = true
      ON MATCH SET r._created = false
      SET r.edge_id = row.id,
          r += row.properties,
          r.updated_at = timestamp()
      WITH r
      RETURN sum(CASE WHEN r._created THEN 1 ELSE 0 END) AS created,
             sum(CASE WHEN r._created THEN 0 ELSE 1 END) AS updated
    `;
    const out = await executeNeo4jWrite(source, cypher, { rows });
    const first = out.records[0];
    if (first) {
      result.edgesCreated += toInt(first.created);
      result.edgesUpdated += toInt(first.updated);
    }
  }

  private async batchDeleteNodes(
    source: GraphSource,
    batch: ProjectionWrite[],
    result: { nodesDeleted: number },
  ): Promise<void> {
    const ids = batch.map((w) => w.node?.id ?? "").filter((s) => s.length > 0);
    if (ids.length === 0) return;
    const cypher = `
      UNWIND $ids AS id
      MATCH (n { id: id })
      DETACH DELETE n
      RETURN count(n) AS deleted
    `;
    const out = await executeNeo4jWrite(source, cypher, { ids });
    const first = out.records[0];
    if (first) result.nodesDeleted += toInt(first.deleted);
  }

  private async batchDeleteEdges(
    source: GraphSource,
    batch: ProjectionWrite[],
    result: { edgesDeleted: number },
  ): Promise<void> {
    const ids = batch.map((w) => w.edge?.id ?? "").filter((s): s is string => !!s && s.length > 0);
    if (ids.length === 0) return;
    const cypher = `
      UNWIND $ids AS id
      MATCH ()-[r { edge_id: id }]->()
      DELETE r
      RETURN count(r) AS deleted
    `;
    const out = await executeNeo4jWrite(source, cypher, { ids });
    const first = out.records[0];
    if (first) result.edgesDeleted += toInt(first.deleted);
  }

  async enqueueProjectionJob(_i: ProjectionSyncJobInput) { return { jobId: 0 }; }
  async takeSnapshot(_s: string) { return { snapshotId: "" }; }
  async detectDrift(_s: string) { return { driftEvents: [] }; }
  async rebuildProjection(_s: string): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  /**
   * Phase 7.5b — Cypher query template execution.
   *
   * Resolves the template via the injected `templateResolver`
   * (typically wired to `ags_query_templates`), passes parameters
   * straight through (Neo4j driver handles serialization), applies
   * the template's `maxResults` as a hard LIMIT, returns the rows.
   *
   * `truncated` is `true` when the result count hits `maxResults` —
   * informational signal that the caller may need to refine the
   * query. Timing measured around `executeNeo4jQuery` only (not
   * the resolver lookup) so the value is comparable across runs.
   */
  async executeTemplate(input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    const resolver = this.options.templateResolver;
    if (!resolver) {
      return { rows: [], truncated: false, durationMs: 0, templateVersion: "no-resolver" };
    }
    const template = await resolver(input.templateKey);
    if (!template) {
      return { rows: [], truncated: false, durationMs: 0, templateVersion: "not-found" };
    }

    const source = this.graphSource();
    const limited = ensureLimit(template.cypherBody, template.maxResults);
    const t0 = Date.now();
    const out = await executeNeo4jQuery(source, limited, {
      ...input.parameters,
      __max_results: template.maxResults,
    });
    const durationMs = Date.now() - t0;
    return {
      rows: out.records,
      truncated: out.records.length >= template.maxResults,
      durationMs,
      templateVersion: template.version,
    };
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

  /**
   * Phase 7.5b — real driver health check via KGIA's wired
   * `testNeo4jConnection`. Returns `status: "ok"` when bolt
   * connectivity succeeds + the kernel version is available;
   * `status: "down"` (with the error message) on failure.
   *
   * Pre-7.5b this returned hardcoded `"degraded"` with the
   * "driver not yet wired" error string.
   */
  async health(): Promise<BackendHealth> {
    const source = this.graphSource();
    const probe = await testNeo4jConnection(source);
    if (probe.connected) {
      return {
        status: "ok",
        errors: [],
        capabilities: this.capabilities,
      };
    }
    return {
      status: "down",
      errors: [probe.error ?? "neo4j connectivity probe failed"],
      capabilities: this.capabilities,
    };
  }
}

// ── helpers ─────────────────────────────────────────────────────

/**
 * Neo4j labels + relationship types are interpolated INTO the
 * Cypher string (parameters can only bind property values, not
 * structure). Sanitize to alphanumeric + underscore to defuse
 * any injection attempt via a hostile `typeKey`.
 */
function sanitizeNeo4jIdentifier(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, "_") || "_unknown";
}

/**
 * Appends a `LIMIT $__max_results` clause when the template body
 * doesn't already end with a LIMIT. Defends against templates that
 * forget to bound their result set — operator UI assumes hard caps.
 *
 * Naive string check; production callers should review templates
 * during the template-authoring flow (Phase 7.5c review pass).
 */
function ensureLimit(cypher: string, _maxResults: number): string {
  if (/\blimit\s+\d+\b/i.test(cypher)) return cypher;
  // Append a LIMIT against the param-bound max so callers don't
  // have to remember it. Trailing semicolon (if any) preserved.
  const stripped = cypher.trimEnd().replace(/;$/, "").trimEnd();
  return `${stripped}\nLIMIT $__max_results`;
}

function toInt(v: unknown): number {
  if (typeof v === "number") return v;
  if (
    v &&
    typeof v === "object" &&
    typeof (v as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return 0;
}
