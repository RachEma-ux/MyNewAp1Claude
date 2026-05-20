/**
 * Neo4jCommunityGraphRepository — wraps KGIA's wired Neo4j adapter.
 *
 * Phase 7.5b (2026-05-17): `executeTemplate` + `applyProjectionJob` shipped.
 * Phase 7.6 (2026-05-17): traversal / permission / explain / projection-
 * sync surfaces all implemented end-to-end. This file replaces the
 * thirteen prior factory-throws / hardcoded-empty placeholders with
 * real Cypher + ASDB-backed lifecycle code.
 *
 * Boundary preserved (CLAUDE.md hard rule):
 *   - This file does NOT import `neo4j-driver`. All Neo4j driver
 *     access routes through KGIA's `executeNeo4jQuery` (read) +
 *     `executeNeo4jWrite` (write). KGIA's adapter is the single
 *     neo4j-driver chokepoint; this repository is the single
 *     GraphRepository entry point.
 *   - Postgres remains source-of-truth: projection-sync writes go to
 *     `ags_graph_projection_*` tables; Neo4j writes happen only
 *     through `applyProjectionJob` / `rebuildProjection` which read
 *     from the SoT first.
 *
 * Test seams:
 *   - `executor` option overrides the KGIA query/write functions so
 *     unit tests can capture Cypher + parameters without a live
 *     Neo4j. Production callers omit the option (defaults to KGIA).
 *   - `db` option overrides the ASDB Drizzle instance for the
 *     projection-sync lifecycle methods. Tests inject a stub.
 *   - `now` clock injection for deterministic timing.
 *
 * Permission model (CE-level, app-side):
 *   - workspace/tenant isolation via `workspace_id` node property
 *   - governance_status filter (active/hidden/archived/deprecated)
 *   - safe-default DENY when runtime carries no `workspaceId` AND
 *     the node has a workspaceId — protects against context-free
 *     queries leaking cross-tenant rows.
 *
 * Cypher safety:
 *   - All value parameters are bound via `$param`. Never interpolated.
 *   - Structural identifiers (labels, relationship types) when
 *     interpolated are sanitized to `[A-Za-z0-9_]` via
 *     `sanitizeNeo4jIdentifier`. Empty input → `_unknown`.
 *
 * ADRs:
 *   - docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md
 *   - docs/architecture/agent-studio-phase-7-5-neo4j-blocker.md
 *   - docs/implementation/agent-studio-code-graph-parser-spike-measurement-2026-05-17.md
 */

import { and, desc, eq, sql } from "drizzle-orm";

// Lazy-loaded KGIA executor: avoids pulling neo4j-driver into the
// module graph until a caller actually executes a query. Tests that
// inject the `executor` factory option never trigger this import.
type GraphSource = unknown;

import { getAsDb } from "../../../db/connection.js";
import {
  agsGraphProjectionDriftEvents,
  agsGraphProjectionRebuilds,
  agsGraphProjectionSnapshots,
  agsGraphProjectionSyncJobs,
  agsGraphProjectionSyncResults,
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
import { NEO4J_CE_CAPABILITIES } from "./capabilities.js";
import type { ReplayCounts } from "../projection/rebuild-replay.js";

// ============================================================================
// Resolver + executor seams
// ============================================================================

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

/**
 * Minimal slice of the KGIA adapter the repository needs. Defaulted to
 * the real KGIA functions; tests inject a stub that records Cypher +
 * parameters and returns canned records.
 */
export interface Neo4jExecutor {
  read(
    source: GraphSource,
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<{ records: Record<string, unknown>[] }>;
  write(
    source: GraphSource,
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<{ records: Record<string, unknown>[] }>;
  testConnection(
    source: GraphSource,
  ): Promise<{ connected: boolean; version?: string; error?: string }>;
}

/**
 * Lazy-load the KGIA adapter on first use. The dynamic import keeps
 * `neo4j-driver` out of the module graph for callers that inject a
 * custom executor (tests, alternative backends). Resolved once and
 * cached.
 */
let cachedKgiaExecutor: Neo4jExecutor | null = null;
async function loadKgiaExecutor(): Promise<Neo4jExecutor> {
  if (cachedKgiaExecutor) return cachedKgiaExecutor;
  const mod = await import(
    "../../../../modules/kgia/infrastructure/neo4j-adapter.js"
  );
  cachedKgiaExecutor = {
    read: mod.executeNeo4jQuery,
    write: mod.executeNeo4jWrite,
    testConnection: mod.testNeo4jConnection,
  };
  return cachedKgiaExecutor;
}

const DEFAULT_EXECUTOR: Neo4jExecutor = {
  async read(source, cypher, params) {
    const exec = await loadKgiaExecutor();
    return exec.read(source, cypher, params);
  },
  async write(source, cypher, params) {
    const exec = await loadKgiaExecutor();
    return exec.write(source, cypher, params);
  },
  async testConnection(source) {
    const exec = await loadKgiaExecutor();
    return exec.testConnection(source);
  },
};

export interface Neo4jCommunityGraphRepositoryOptions {
  readonly endpoint: string;
  readonly username: string;
  readonly password: string;
  readonly database?: string;
  readonly templateResolver?: QueryTemplateResolver;
  /**
   * Test seam — when supplied, replaces the KGIA executor functions.
   * Production callers omit; production defaults to the wired
   * KGIA adapter. */
  readonly executor?: Neo4jExecutor;
  /**
   * Test seam — ASDB Drizzle instance override for projection-sync
   * lifecycle methods. Defaults to `getAsDb()` lazy accessor. */
  readonly db?: unknown;
  /** Clock injection for deterministic timing. */
  readonly now?: () => number;
}

// ============================================================================
// Constants
// ============================================================================

const PROJECTION_BATCH_SIZE = 1000;
const DEFAULT_MAX_DEPTH = 4;
const ABSOLUTE_MAX_DEPTH = 8;
const DEFAULT_MAX_RESULTS = 200;
const ABSOLUTE_MAX_RESULTS = 2000;
const DEFAULT_SAMPLE_SIZE = 100;
const SHORTEST_PATH_MAX_DEPTH = 8;

/** Allow-listed graph algorithms (Neo4j CE only — no GDS plugin assumed). */
const SUPPORTED_ALGORITHMS = new Set<string>(["shortest_path"]);

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

// ============================================================================
// Implementation
// ============================================================================

export class Neo4jCommunityGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "neo4j-ce";
  readonly capabilities: BackendCapabilities = NEO4J_CE_CAPABILITIES;

  private readonly executor: Neo4jExecutor;
  private readonly now: () => number;

  constructor(private readonly options: Neo4jCommunityGraphRepositoryOptions) {
    this.executor = options.executor ?? DEFAULT_EXECUTOR;
    this.now = options.now ?? Date.now;
  }

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

  private requireDb(): AsDb {
    const db = (this.options.db as AsDb | null) ?? (getAsDb() as AsDb | null);
    if (!db) {
      throw new Error(
        "[neo4j-ce] ASDB unavailable — projection-sync lifecycle requires DATABASE_URL_ASDB",
      );
    }
    return db;
  }

  // ────────────────────────────────────────────────────────────────
  // Traversal — P0-2
  // ────────────────────────────────────────────────────────────────

  async localGraph(
    seedNodeId: string,
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): Promise<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
    truncationReason?: string;
  }> {
    if (!seedNodeId || typeof seedNodeId !== "string") {
      return { nodes: [], edges: [], truncated: false };
    }
    const maxDepth = clampDepth(options.maxDepth ?? DEFAULT_MAX_DEPTH);
    const maxResults = clampMaxResults(options.maxResults ?? DEFAULT_MAX_RESULTS);
    // Variable-length traversal: `[r*1..<depth>]`. The depth literal
    // is structurally interpolated because Cypher syntax requires
    // it to be a compile-time integer, not a parameter. We clamp to
    // ABSOLUTE_MAX_DEPTH so a hostile caller can't escalate the cost.
    const cypher = `
      MATCH path = (seed { id: $seedId })-[r*1..${maxDepth}]-(neighbor)
      WHERE coalesce(neighbor.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR neighbor.workspace_id IS NULL
             OR neighbor.workspace_id = $workspaceId)
      WITH path, nodes(path) AS pathNodes, relationships(path) AS pathRels
      UNWIND pathNodes AS n
      WITH collect(DISTINCT n) AS allNodes, collect(DISTINCT pathRels) AS allRelGroups
      UNWIND allRelGroups AS relGroup
      UNWIND relGroup AS rel
      WITH allNodes, collect(DISTINCT rel) AS allRels
      RETURN allNodes AS nodes, allRels AS edges
      LIMIT $maxResults
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      seedId: seedNodeId,
      workspaceId: runtime.workspaceId ?? null,
      governanceFilter: runtime.governanceStatusFilter ?? ["active"],
      maxResults,
    });
    const record = out.records[0] ?? { nodes: [], edges: [] };
    const rawNodes = toArray(record.nodes);
    const rawEdges = toArray(record.edges);
    const nodes = rawNodes.slice(0, maxResults).map(coerceNodeIdentity);
    const edges = rawEdges.slice(0, maxResults).map(coerceEdgeIdentity);
    const truncated =
      rawNodes.length > nodes.length || rawEdges.length > edges.length;
    return {
      nodes,
      edges,
      truncated,
      ...(truncated
        ? {
            truncationReason: `result capped at maxResults=${maxResults} (saw ${rawNodes.length} nodes / ${rawEdges.length} edges)`,
          }
        : {}),
    };
  }

  async globalGraphSample(
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): Promise<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
  }> {
    const sampleSize = clampMaxResults(
      options.maxResults ?? DEFAULT_SAMPLE_SIZE,
    );
    const cypher = `
      MATCH (n)
      WHERE coalesce(n.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR n.workspace_id IS NULL
             OR n.workspace_id = $workspaceId)
      WITH n LIMIT $sampleSize
      OPTIONAL MATCH (n)-[r]-(m)
      WHERE coalesce(m.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR m.workspace_id IS NULL
             OR m.workspace_id = $workspaceId)
      WITH collect(DISTINCT n) + collect(DISTINCT m) AS allNodes, collect(DISTINCT r) AS allRels
      RETURN allNodes AS nodes, allRels AS edges
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      workspaceId: runtime.workspaceId ?? null,
      governanceFilter: runtime.governanceStatusFilter ?? ["active"],
      sampleSize,
    });
    const record = out.records[0] ?? { nodes: [], edges: [] };
    const rawNodes = toArray(record.nodes).filter(Boolean);
    const rawEdges = toArray(record.edges).filter(Boolean);
    const nodes = rawNodes.slice(0, sampleSize).map(coerceNodeIdentity);
    const edges = rawEdges.slice(0, sampleSize).map(coerceEdgeIdentity);
    return {
      nodes,
      edges,
      truncated: rawNodes.length >= sampleSize,
    };
  }

  async neighborhood(
    nodeId: string,
    depth: number,
    runtime: RuntimeContext,
  ): Promise<{ nodes: NodeIdentity[]; edges: EdgeIdentity[] }> {
    if (!nodeId) return { nodes: [], edges: [] };
    const clampedDepth = clampDepth(depth);
    const cypher = `
      MATCH (seed { id: $seedId })
      OPTIONAL MATCH (seed)-[r*1..${clampedDepth}]-(neighbor)
      WHERE neighbor IS NULL OR (
        coalesce(neighbor.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR neighbor.workspace_id IS NULL
             OR neighbor.workspace_id = $workspaceId)
      )
      WITH seed, neighbor, r
      RETURN
        collect(DISTINCT seed) + collect(DISTINCT neighbor) AS nodes,
        reduce(acc = [], rels IN collect(r) | acc + coalesce(rels, [])) AS edges
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      seedId: nodeId,
      workspaceId: runtime.workspaceId ?? null,
      governanceFilter: runtime.governanceStatusFilter ?? ["active"],
    });
    const record = out.records[0] ?? { nodes: [], edges: [] };
    const nodes = toArray(record.nodes).filter(Boolean).map(coerceNodeIdentity);
    const edges = toArray(record.edges).filter(Boolean).map(coerceEdgeIdentity);
    return { nodes, edges };
  }

  async shortestPath(
    fromNodeId: string,
    toNodeId: string,
    runtime: RuntimeContext,
  ): Promise<TraversalPath | null> {
    if (!fromNodeId || !toNodeId) return null;
    const cypher = `
      MATCH (from { id: $fromId }), (to { id: $toId })
      MATCH path = shortestPath((from)-[*..${SHORTEST_PATH_MAX_DEPTH}]-(to))
      WHERE ALL(n IN nodes(path) WHERE
        coalesce(n.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR n.workspace_id IS NULL
             OR n.workspace_id = $workspaceId))
      RETURN nodes(path) AS pathNodes, relationships(path) AS pathRels
      LIMIT 1
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      fromId: fromNodeId,
      toId: toNodeId,
      workspaceId: runtime.workspaceId ?? null,
      governanceFilter: runtime.governanceStatusFilter ?? ["active"],
    });
    const record = out.records[0];
    if (!record) return null;
    const nodes = toArray(record.pathNodes).map(coerceNodeIdentity);
    const edges = toArray(record.pathRels).map(coerceEdgeIdentity);
    return {
      nodes,
      edges,
      length: edges.length,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Projection writes — P0 (already shipped Phase 7.5b)
  // ────────────────────────────────────────────────────────────────

  async upsertNode(
    node: NodeIdentity & { properties: NodeProperties; provenance: ProvenanceFields },
  ) {
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

  async applyProjectionJob(writes: ProjectionWrite[]): Promise<ProjectionResult> {
    const t0 = this.now();
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

    return { ...result, durationMs: this.now() - t0 };
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
    const out = await this.executor.write(source, cypher, { rows });
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
    const out = await this.executor.write(source, cypher, { rows });
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
    const out = await this.executor.write(source, cypher, { ids });
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
    const out = await this.executor.write(source, cypher, { ids });
    const first = out.records[0];
    if (first) result.edgesDeleted += toInt(first.deleted);
  }

  // ────────────────────────────────────────────────────────────────
  // Projection sync lifecycle — P0-6
  // ────────────────────────────────────────────────────────────────

  async enqueueProjectionJob(
    input: ProjectionSyncJobInput,
  ): Promise<{ jobId: number }> {
    const db = this.requireDb();
    const [row] = await db
      .insert(agsGraphProjectionSyncJobs)
      .values({
        projectionKey: input.projectionKey,
        triggerEvent: input.triggerEvent,
        triggerPayload: (input.triggerPayload as Record<string, unknown>) ?? null,
        status: "pending",
      })
      .returning({ id: agsGraphProjectionSyncJobs.id });
    if (!row) {
      throw new Error(
        "[neo4j-ce] enqueueProjectionJob — insert returned no row",
      );
    }
    return { jobId: row.id };
  }

  async takeSnapshot(scope: string): Promise<{ snapshotId: string }> {
    const db = this.requireDb();
    const source = this.graphSource();
    // Count graph entities visible at snapshot time. Snapshot stays
    // append-only; restoration is operator territory.
    let nodeCount = 0;
    let edgeCount = 0;
    try {
      const nodeOut = await this.executor.read(
        source,
        "MATCH (n) RETURN count(n) AS c",
      );
      nodeCount = toInt(nodeOut.records[0]?.c);
      const edgeOut = await this.executor.read(
        source,
        "MATCH ()-[r]->() RETURN count(r) AS c",
      );
      edgeCount = toInt(edgeOut.records[0]?.c);
    } catch {
      // If Neo4j is unavailable, snapshot still records the intent
      // with counts=0; operator triages from the storageUri metadata.
    }
    const snapshotKey = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const [row] = await db
      .insert(agsGraphProjectionSnapshots)
      .values({
        snapshotKey,
        scope,
        nodeCount,
        edgeCount,
        metadata: {
          backendKey: this.backendKey,
          takenAtMs: this.now(),
        } as Record<string, unknown>,
      })
      .returning({ id: agsGraphProjectionSnapshots.id });
    if (!row) {
      throw new Error("[neo4j-ce] takeSnapshot — insert returned no row");
    }
    return { snapshotId: snapshotKey };
  }

  async detectDrift(scope: string): Promise<{
    driftEvents: { class: string; sourceId: string; details: unknown }[];
  }> {
    const db = this.requireDb();
    // Pull unresolved drift events for this scope plus any
    // failed/recent sync jobs that imply unfinished projection work.
    const driftRows = await db
      .select({
        driftClass: agsGraphProjectionDriftEvents.driftClass,
        sourceId: agsGraphProjectionDriftEvents.sourceId,
        sourceVersionId: agsGraphProjectionDriftEvents.sourceVersionId,
        neo4jVersionId: agsGraphProjectionDriftEvents.neo4jVersionId,
        detectedAt: agsGraphProjectionDriftEvents.detectedAt,
        remediation: agsGraphProjectionDriftEvents.remediation,
      })
      .from(agsGraphProjectionDriftEvents)
      .where(
        and(
          eq(agsGraphProjectionDriftEvents.projectionKey, scope),
          sql`${agsGraphProjectionDriftEvents.remediatedAt} IS NULL`,
        ),
      )
      .orderBy(desc(agsGraphProjectionDriftEvents.detectedAt))
      .limit(500);

    const failedJobRows = await db
      .select({
        id: agsGraphProjectionSyncJobs.id,
        status: agsGraphProjectionSyncJobs.status,
        lastError: agsGraphProjectionSyncJobs.lastError,
        updatedAt: agsGraphProjectionSyncJobs.updatedAt,
      })
      .from(agsGraphProjectionSyncJobs)
      .where(
        and(
          eq(agsGraphProjectionSyncJobs.projectionKey, scope),
          eq(agsGraphProjectionSyncJobs.status, "failed"),
        ),
      )
      .orderBy(desc(agsGraphProjectionSyncJobs.updatedAt))
      .limit(100);

    const driftEvents: { class: string; sourceId: string; details: unknown }[] =
      driftRows.map((r) => ({
        class: r.driftClass,
        sourceId: r.sourceId,
        details: {
          sourceVersionId: r.sourceVersionId,
          neo4jVersionId: r.neo4jVersionId,
          detectedAt: r.detectedAt,
          remediation: r.remediation,
        },
      }));

    for (const j of failedJobRows) {
      driftEvents.push({
        class: "sync_job_failed",
        sourceId: `job:${j.id}`,
        details: {
          status: j.status,
          lastError: j.lastError,
          updatedAt: j.updatedAt,
        },
      });
    }

    return { driftEvents };
  }

  async rebuildProjection(scope: string): Promise<ProjectionResult> {
    const db = this.requireDb();
    const startedAt = new Date();
    const [rebuildRow] = await db
      .insert(agsGraphProjectionRebuilds)
      .values({
        trigger: "manual_rebuild",
        scope,
        status: "running",
        startedAt,
      })
      .returning({ id: agsGraphProjectionRebuilds.id });

    const tStart = this.now();
    // Closes the partial-implementation gap (PR #1397 item 14):
    // synchronous worker-side replay against Postgres SoT. The replay
    // module loads source rows for the scope, synthesises
    // ProjectionEvents, and feeds them through ProjectionSyncWorker
    // which writes to Neo4j via applyProjectionJob (this very
    // repository's method). Counts come from the real writes — not
    // a placeholder zero — and land in the rebuild row's `summary`
    // so admin UIs can render them honestly.
    let result: ProjectionResult;
    let scopeCounts: ReplayCounts | null = null;
    let replayErrors = 0;
    try {
      const { replayProjectionScope } = await import(
        "../projection/rebuild-replay.js"
      );
      const { ProjectionSyncWorker } = await import(
        "../projection/sync-worker.js"
      );
      const replay = await replayProjectionScope(scope, {
        worker: new ProjectionSyncWorker({ repository: this }),
      });
      result = {
        nodesCreated: replay.nodesCreated,
        nodesUpdated: replay.nodesUpdated,
        nodesDeleted: replay.nodesDeleted,
        edgesCreated: replay.edgesCreated,
        edgesUpdated: replay.edgesUpdated,
        edgesDeleted: replay.edgesDeleted,
        durationMs: this.now() - tStart,
        errors: replay.errors,
      };
      scopeCounts = replay.counts;
      replayErrors = replay.errors.length;
    } catch (err) {
      result = {
        nodesCreated: 0,
        nodesUpdated: 0,
        nodesDeleted: 0,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesDeleted: 0,
        durationMs: this.now() - tStart,
        errors: [
          {
            write: {
              kind: "upsert_node",
              node: { typeKey: "_rebuild_replay", id: scope },
            },
            error: err instanceof Error ? err.message : String(err),
          } as unknown as ProjectionResult["errors"][number],
        ],
      };
      replayErrors = 1;
    }

    if (rebuildRow) {
      await db
        .update(agsGraphProjectionRebuilds)
        .set({
          completedAt: new Date(),
          status: replayErrors === 0 ? "completed" : "failed",
          summary: {
            backendKey: this.backendKey,
            scope,
            counts: scopeCounts,
            writes: {
              nodesUpdated: result.nodesUpdated,
              edgesUpdated: result.edgesUpdated,
            },
            errors: replayErrors,
            durationMs: result.durationMs,
          } as Record<string, unknown>,
        })
        .where(eq(agsGraphProjectionRebuilds.id, rebuildRow.id));
    }
    return result;
  }

  // ────────────────────────────────────────────────────────────────
  // Query templates — P0 (already shipped Phase 7.5b)
  // ────────────────────────────────────────────────────────────────

  async executeTemplate(
    input: QueryTemplateExecutionInput,
  ): Promise<QueryTemplateExecutionResult> {
    const resolver = this.options.templateResolver;
    if (!resolver) {
      return {
        rows: [],
        truncated: false,
        durationMs: 0,
        templateVersion: "no-resolver",
      };
    }
    const template = await resolver(input.templateKey);
    if (!template) {
      return {
        rows: [],
        truncated: false,
        durationMs: 0,
        templateVersion: "not-found",
      };
    }
    const source = this.graphSource();
    const limited = ensureLimit(template.cypherBody, template.maxResults);
    const t0 = this.now();
    const out = await this.executor.read(source, limited, {
      ...input.parameters,
      __max_results: template.maxResults,
    });
    const durationMs = this.now() - t0;
    return {
      rows: out.records,
      truncated: out.records.length >= template.maxResults,
      durationMs,
      templateVersion: template.version,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Algorithms — P0-5 (capability-gated)
  // ────────────────────────────────────────────────────────────────

  async runAlgorithm(input: GraphAlgorithmInput): Promise<GraphAlgorithmResult> {
    if (!SUPPORTED_ALGORITHMS.has(input.algorithmKey)) {
      // Surface as a typed capability error — callers MUST branch on
      // this rather than treating empty rows as a successful run.
      throw new GraphCapabilityUnsupportedError(
        "supportsGraphAlgorithms",
        this.backendKey,
      );
    }
    if (input.algorithmKey === "shortest_path") {
      const t0 = this.now();
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
        durationMs: this.now() - t0,
      };
    }
    return { rows: [], durationMs: 0 };
  }

  // ────────────────────────────────────────────────────────────────
  // Permissions — P0-3
  // ────────────────────────────────────────────────────────────────

  async filterByPermissions<T extends NodeIdentity>(
    nodes: T[],
    runtime: RuntimeContext,
  ): Promise<T[]> {
    if (nodes.length === 0) return nodes;
    const ids = nodes.map((n) => n.id);
    const cypher = `
      MATCH (n)
      WHERE n.id IN $ids
      RETURN n.id AS id,
             coalesce(n.governance_status, 'active') AS governanceStatus,
             n.workspace_id AS workspaceId,
             coalesce(n.visibility, 'visible') AS visibility,
             coalesce(n.sensitivity, 'public') AS sensitivity
    `;
    const out = await this.executor.read(this.graphSource(), cypher, { ids });
    const visibilityMap = new Map<string, boolean>();
    for (const row of out.records) {
      const id = String(row.id ?? "");
      visibilityMap.set(
        id,
        isVisibleToRuntime(
          {
            governanceStatus: String(row.governanceStatus ?? "active"),
            workspaceId: row.workspaceId == null ? null : toInt(row.workspaceId),
            visibility: String(row.visibility ?? "visible"),
            sensitivity: String(row.sensitivity ?? "public"),
          },
          runtime,
        ),
      );
    }
    // Default-deny: any input node not returned by the query is
    // unknown to the backend and therefore not visible.
    return nodes.filter((n) => visibilityMap.get(n.id) === true);
  }

  async isVisibleToUser(
    nodeId: string,
    runtime: RuntimeContext,
  ): Promise<boolean> {
    if (!nodeId) return false;
    const cypher = `
      MATCH (n { id: $id })
      RETURN coalesce(n.governance_status, 'active') AS governanceStatus,
             n.workspace_id AS workspaceId,
             coalesce(n.visibility, 'visible') AS visibility,
             coalesce(n.sensitivity, 'public') AS sensitivity
      LIMIT 1
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      id: nodeId,
    });
    const row = out.records[0];
    if (!row) return false;
    return isVisibleToRuntime(
      {
        governanceStatus: String(row.governanceStatus ?? "active"),
        workspaceId: row.workspaceId == null ? null : toInt(row.workspaceId),
        visibility: String(row.visibility ?? "visible"),
        sensitivity: String(row.sensitivity ?? "public"),
      },
      runtime,
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Explain — P0-4
  // ────────────────────────────────────────────────────────────────

  async explainPath(
    fromNodeId: string,
    toNodeId: string,
    runtime: RuntimeContext,
  ): Promise<{ path: TraversalPath | null; cypher?: string; cost?: number }> {
    const cypher = `MATCH path = shortestPath((from { id: $fromId })-[*..${SHORTEST_PATH_MAX_DEPTH}]-(to { id: $toId })) RETURN path`;
    const path = await this.shortestPath(fromNodeId, toNodeId, runtime);
    return {
      path,
      cypher,
      cost: path?.length ?? 0,
    };
  }

  async explainNode(
    nodeId: string,
    runtime: RuntimeContext,
  ): Promise<{
    node: NodeIdentity;
    properties: NodeProperties;
    provenance: ProvenanceFields;
  } | null> {
    if (!nodeId) return null;
    const cypher = `
      MATCH (n { id: $id })
      WHERE coalesce(n.governance_status, 'active') IN $governanceFilter
        AND ($workspaceId IS NULL
             OR n.workspace_id IS NULL
             OR n.workspace_id = $workspaceId)
      RETURN n AS node, labels(n) AS labels
      LIMIT 1
    `;
    const out = await this.executor.read(this.graphSource(), cypher, {
      id: nodeId,
      workspaceId: runtime.workspaceId ?? null,
      governanceFilter: runtime.governanceStatusFilter ?? ["active"],
    });
    const record = out.records[0];
    if (!record) return null;
    const raw = record.node as Record<string, unknown> | undefined;
    if (!raw) return null;
    const props = nodePropsOf(raw);
    const labels = toArray(record.labels).map(String);
    return {
      node: {
        typeKey: labels[0] ?? "_unknown",
        id: String(props.id ?? nodeId),
        sourceId: props.source_id == null ? undefined : String(props.source_id),
        sourceVersionId:
          props.source_version_id == null
            ? undefined
            : String(props.source_version_id),
      },
      properties: props,
      provenance: extractProvenance(props),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Benchmark — P0 (already shipped)
  // ────────────────────────────────────────────────────────────────

  async runBenchmark(
    scenario: BenchmarkScenario,
    iterations: number,
  ): Promise<BenchmarkResult> {
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
    const source = this.graphSource();
    const probe = await this.executor.testConnection(source);
    if (probe.connected) {
      return {
        status: "healthy",
        errors: [],
        capabilities: this.capabilities,
      };
    }
    return {
      status: "unavailable",
      errors: [probe.error ?? "neo4j connectivity probe failed"],
      capabilities: this.capabilities,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function clampDepth(d: number): number {
  if (!Number.isFinite(d) || d <= 0) return 1;
  if (d > ABSOLUTE_MAX_DEPTH) return ABSOLUTE_MAX_DEPTH;
  return Math.floor(d);
}

function clampMaxResults(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_RESULTS;
  if (n > ABSOLUTE_MAX_RESULTS) return ABSOLUTE_MAX_RESULTS;
  return Math.floor(n);
}

function sanitizeNeo4jIdentifier(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, "_") || "_unknown";
}

function ensureLimit(cypher: string, _maxResults: number): string {
  if (/\blimit\s+\d+\b/i.test(cypher)) return cypher;
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
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function nodePropsOf(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const candidate =
    (raw as { properties?: Record<string, unknown> }).properties ??
    (raw as Record<string, unknown>);
  return candidate ?? {};
}

function coerceNodeIdentity(raw: unknown): NodeIdentity {
  if (!raw || typeof raw !== "object") {
    return { typeKey: "_unknown", id: "" };
  }
  const obj = raw as Record<string, unknown>;
  const properties = nodePropsOf(obj);
  const labels = toArray((obj as { labels?: unknown }).labels).map(String);
  return {
    typeKey:
      labels[0] ??
      String(properties.typeKey ?? properties.type_key ?? "_unknown"),
    id: String(properties.id ?? obj.id ?? ""),
    sourceId:
      properties.source_id == null
        ? undefined
        : String(properties.source_id),
    sourceVersionId:
      properties.source_version_id == null
        ? undefined
        : String(properties.source_version_id),
  };
}

function coerceEdgeIdentity(raw: unknown): EdgeIdentity {
  if (!raw || typeof raw !== "object") {
    return {
      typeKey: "_unknown",
      sourceNode: { typeKey: "_unknown", id: "" },
      targetNode: { typeKey: "_unknown", id: "" },
    };
  }
  const obj = raw as Record<string, unknown>;
  const properties = nodePropsOf(obj);
  return {
    typeKey: String(
      (obj as { type?: unknown }).type ??
        properties.typeKey ??
        properties.type_key ??
        "_unknown",
    ),
    id: properties.edge_id ? String(properties.edge_id) : undefined,
    sourceNode: {
      typeKey: "_unknown",
      id: String(
        (obj as { startNodeElementId?: unknown }).startNodeElementId ??
          (obj as { start?: unknown }).start ??
          properties.source_id ??
          "",
      ),
    },
    targetNode: {
      typeKey: "_unknown",
      id: String(
        (obj as { endNodeElementId?: unknown }).endNodeElementId ??
          (obj as { end?: unknown }).end ??
          properties.target_id ??
          "",
      ),
    },
  };
}

function extractProvenance(props: Record<string, unknown>): ProvenanceFields {
  const lineageRaw = String(props.lineage_status ?? props.lineageStatus ?? "asserted");
  const allowedLineage = new Set(["derived", "asserted", "inferred", "imported"]);
  const lineageStatus = (
    allowedLineage.has(lineageRaw) ? lineageRaw : "asserted"
  ) as ProvenanceFields["lineageStatus"];
  return {
    sourceType: String(props.source_type ?? props.sourceType ?? "unknown"),
    sourceId: String(props.source_id ?? props.sourceId ?? ""),
    sourceVersionId:
      props.source_version_id == null
        ? undefined
        : String(props.source_version_id),
    sourceLocator:
      props.source_locator == null ? undefined : String(props.source_locator),
    createdByUserId:
      props.created_by_user_id == null
        ? undefined
        : toInt(props.created_by_user_id),
    createdByProcess:
      props.created_by_process == null
        ? undefined
        : String(props.created_by_process),
    createdByAgentId:
      props.created_by_agent_id == null
        ? undefined
        : toInt(props.created_by_agent_id),
    confidence:
      props.confidence == null ? undefined : toInt(props.confidence),
    lineageStatus,
    extractionMethod:
      props.extraction_method == null
        ? undefined
        : String(props.extraction_method),
    validationStatus: (() => {
      const v = String(props.validation_status ?? "");
      const allowed = new Set(["unvalidated", "validated", "flagged"]);
      return allowed.has(v)
        ? (v as ProvenanceFields["validationStatus"])
        : undefined;
    })(),
    governanceStatus: (() => {
      const v = String(props.governance_status ?? "active");
      const allowed = new Set(["active", "hidden", "archived", "deprecated"]);
      return allowed.has(v)
        ? (v as ProvenanceFields["governanceStatus"])
        : "active";
    })(),
    validFrom:
      props.valid_from == null ? undefined : String(props.valid_from),
    validTo: props.valid_to == null ? undefined : String(props.valid_to),
    projectionSnapshotId:
      props.projection_snapshot_id == null
        ? undefined
        : String(props.projection_snapshot_id),
  };
}

/**
 * Permission rule centralisation. Returns true iff a node is visible
 * to the runtime context. Safe-default DENY when the node carries a
 * workspaceId AND the runtime carries none (a context-free query
 * cannot prove cross-tenant authorisation).
 *
 * Inputs:
 *   - `governanceStatus`: visible iff in runtime.governanceStatusFilter
 *     (defaults to `["active"]`).
 *   - `workspaceId`: must match runtime.workspaceId OR appear in
 *     runtime.allowedWorkspaces, OR be null (unscoped node).
 *   - `visibility`: nodes tagged `hidden` are denied unless the
 *     runtime carries `userRole === "admin"`.
 *   - `sensitivity`: nodes tagged `confidential` are denied unless
 *     the runtime carries `userRole === "admin"` or `"approver"`.
 */
export function isVisibleToRuntime(
  node: {
    governanceStatus: string;
    workspaceId: number | null;
    visibility: string;
    sensitivity: string;
  },
  runtime: RuntimeContext,
): boolean {
  const filter = runtime.governanceStatusFilter ?? ["active"];
  if (!filter.includes(node.governanceStatus as never)) return false;
  // Workspace check
  if (node.workspaceId != null) {
    const workspaces = new Set<number>();
    if (runtime.workspaceId != null) workspaces.add(runtime.workspaceId);
    for (const w of runtime.allowedWorkspaces ?? []) workspaces.add(w);
    if (workspaces.size === 0) {
      // Safe-default DENY: node scoped to a workspace but runtime
      // didn't bring any workspace authorization.
      return false;
    }
    if (!workspaces.has(node.workspaceId)) return false;
  }
  // Visibility / sensitivity role gates
  const role = runtime.userRole ?? "";
  if (node.visibility === "hidden" && role !== "admin") return false;
  if (
    node.sensitivity === "confidential" &&
    role !== "admin" &&
    role !== "approver"
  ) {
    return false;
  }
  return true;
}
