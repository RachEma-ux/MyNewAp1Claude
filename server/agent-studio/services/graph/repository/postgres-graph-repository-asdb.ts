/**
 * AsdbPostgresGraphRepository — ASDB-backed implementation (Phase 7).
 *
 * Real Drizzle-backed graph node + edge upsert / read. The wired
 * `postgres` backend in `getGraphRepository()` since 2026-05-19 —
 * `case "postgres"` instantiates this class.
 *
 * Recursive-CTE traversal is intentionally kept simple — depth-3 is the
 * documented performance ceiling for Postgres in the backend decision ADR
 * (`agent-studio-active-graph-backend-decision.md`). Production deployments
 * promote `Neo4jCommunityGraphRepository` per Phase 1.5.
 *
 * The 176-LoC skeleton at `./postgres-graph-repository.ts` is kept
 * as the re-export named `PostgresGraphRepository` for back-compat —
 * not constructed by the factory, not used by any caller. Deletable in
 * a follow-up once nothing imports the name directly.
 */

import { and, eq, sql } from "drizzle-orm";
import { getAsDb } from "../../../db/connection.js";
import {
  agsGraphNodes,
  agsGraphEdges,
} from "../../../../../drizzle/tables/agent-studio-graph.js";
import { agsQueryTemplates } from "../../../../../drizzle/tables/agent-studio-graph-skill.js";
import type {
  BackendCapabilities,
  BackendHealth,
  BackendKey,
  EdgeIdentity,
  EdgeProperties,
  GraphRepository,
  NodeIdentity,
  NodeProperties,
  ProjectionResult,
  ProjectionWrite,
  ProvenanceFields,
  QueryTemplateExecutionInput,
  QueryTemplateExecutionResult,
  RuntimeContext,
  TraversalOptions,
  TraversalPath,
} from "./types.js";
import { POSTGRES_CAPABILITIES } from "./capabilities.js";

export class AsdbPostgresGraphRepository implements GraphRepository {
  readonly backendKey: BackendKey = "postgres";
  readonly capabilities: BackendCapabilities = POSTGRES_CAPABILITIES;

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
    if (sourceId == null || targetId == null) {
      // Endpoint missing — skip silently. Caller relies on projection-sync
      // ordering (nodes before edges).
      return;
    }
    await conn.insert(agsGraphEdges).values({
      typeKey: edge.typeKey,
      edgeKey: edge.id,
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

  // ----- Read paths -----

  async localGraph(
    seedNodeId: string,
    options: TraversalOptions,
    runtime: RuntimeContext,
  ): Promise<{ nodes: NodeIdentity[]; edges: EdgeIdentity[]; truncated: boolean }> {
    const conn = getAsDb();
    const govFilter = runtime.governanceStatusFilter ?? ["active"];
    // Drizzle's `sql\`...${arr}...\`` template spreads array params
    // into individual placeholders, so `ANY($n)` sees scalars and
    // throws `malformed array literal`. Build a comma-separated list
    // with `sql.join` and use `IN (…)` instead.
    const govList = sql.join(
      govFilter.map((g) => sql`${g}`),
      sql`, `,
    );
    // Depth-N recursive CTE — Postgres only. Walks both outbound and
    // inbound edges so the local view around a seed node shows the
    // neighborhood, not just descendants.
    const nodeRows = await conn.execute(sql`
      WITH RECURSIVE walk AS (
        SELECT n.id, n.type_key, n.node_key, 0::int AS depth
        FROM ${agsGraphNodes} n
        WHERE n.node_key = ${seedNodeId}
          AND n.governance_status IN (${govList})
        UNION
        SELECT n.id, n.type_key, n.node_key, w.depth + 1
        FROM ${agsGraphEdges} e
        JOIN walk w ON e.source_node_id = w.id OR e.target_node_id = w.id
        JOIN ${agsGraphNodes} n
          ON n.id = CASE WHEN e.source_node_id = w.id THEN e.target_node_id ELSE e.source_node_id END
        WHERE w.depth < ${options.maxDepth}
          AND n.governance_status IN (${govList})
          AND e.governance_status IN (${govList})
      )
      SELECT id, type_key, node_key FROM walk LIMIT ${options.maxResults};
    `);

    // node-postgres / drizzle-pg returns `{ rows, rowCount, ... }` for
    // raw `execute(sql\`\`)` calls.
    const nodeRecords =
      (nodeRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
      (Array.isArray(nodeRows) ? (nodeRows as Array<Record<string, unknown>>) : []);
    const nodes: NodeIdentity[] = nodeRecords.map((r) => ({
      typeKey: String(r.type_key),
      id: String(r.node_key),
    }));

    if (nodes.length === 0) {
      return { nodes, edges: [], truncated: false };
    }

    // Edges between walked nodes — single SELECT joined on the
    // node_key set so source-of-truth lookups stay one round-trip.
    const walkedKeyList = sql.join(
      nodes.map((n) => sql`${n.id}`),
      sql`, `,
    );
    const edgeRows = await conn.execute(sql`
      SELECT
        e.type_key AS edge_type_key,
        e.edge_key,
        sn.type_key AS src_type,
        sn.node_key AS src_key,
        tn.type_key AS tgt_type,
        tn.node_key AS tgt_key
      FROM ${agsGraphEdges} e
      JOIN ${agsGraphNodes} sn ON sn.id = e.source_node_id
      JOIN ${agsGraphNodes} tn ON tn.id = e.target_node_id
      WHERE sn.node_key IN (${walkedKeyList})
        AND tn.node_key IN (${walkedKeyList})
        AND e.governance_status IN (${govList})
      LIMIT ${options.maxResults};
    `);

    const edgeRecords =
      (edgeRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
      (Array.isArray(edgeRows) ? (edgeRows as Array<Record<string, unknown>>) : []);
    const edges: EdgeIdentity[] = edgeRecords.map((r) => ({
      typeKey: String(r.edge_type_key),
      id: String(r.edge_key ?? ""),
      sourceNode: { typeKey: String(r.src_type), id: String(r.src_key) },
      targetNode: { typeKey: String(r.tgt_type), id: String(r.tgt_key) },
    }));

    return {
      nodes,
      edges,
      truncated: nodes.length >= options.maxResults || edges.length >= options.maxResults,
    };
  }

  async globalGraphSample(options: TraversalOptions, runtime: RuntimeContext) {
    const conn = getAsDb();
    const govFilter = runtime.governanceStatusFilter ?? ["active"];
    // See `localGraph` for the Drizzle array-spread caveat.
    const govList = sql.join(
      govFilter.map((g) => sql`${g}`),
      sql`, `,
    );
    const rows = await conn
      .select({ typeKey: agsGraphNodes.typeKey, nodeKey: agsGraphNodes.nodeKey })
      .from(agsGraphNodes)
      .where(sql`${agsGraphNodes.governanceStatus} IN (${govList})`)
      .limit(options.maxResults);
    const nodes: NodeIdentity[] = rows.map((r) => ({ typeKey: r.typeKey, id: r.nodeKey }));

    if (nodes.length === 0) {
      return { nodes, edges: [], truncated: false };
    }

    // Edge sample — return edges where both endpoints are in the
    // sampled node set. Conservative interpretation (no dangling
    // edges to outside-sample nodes) keeps the global viz coherent
    // without a second round-trip to fetch boundary nodes.
    const sampledKeyList = sql.join(
      nodes.map((n) => sql`${n.id}`),
      sql`, `,
    );
    const edgeRows = await conn.execute(sql`
      SELECT
        e.type_key AS edge_type_key,
        e.edge_key,
        sn.type_key AS src_type,
        sn.node_key AS src_key,
        tn.type_key AS tgt_type,
        tn.node_key AS tgt_key
      FROM ${agsGraphEdges} e
      JOIN ${agsGraphNodes} sn ON sn.id = e.source_node_id
      JOIN ${agsGraphNodes} tn ON tn.id = e.target_node_id
      WHERE sn.node_key IN (${sampledKeyList})
        AND tn.node_key IN (${sampledKeyList})
        AND e.governance_status IN (${govList})
      LIMIT ${options.maxResults};
    `);
    const edgeRecords =
      (edgeRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
      (Array.isArray(edgeRows) ? (edgeRows as Array<Record<string, unknown>>) : []);
    const edges: EdgeIdentity[] = edgeRecords.map((r) => ({
      typeKey: String(r.edge_type_key),
      id: String(r.edge_key ?? ""),
      sourceNode: { typeKey: String(r.src_type), id: String(r.src_key) },
      targetNode: { typeKey: String(r.tgt_type), id: String(r.tgt_key) },
    }));

    return {
      nodes,
      edges,
      truncated:
        rows.length >= options.maxResults ||
        edges.length >= options.maxResults,
    };
  }

  async neighborhood(nodeId: string, depth: number, runtime: RuntimeContext) {
    const r = await this.localGraph(nodeId, { maxDepth: depth, maxResults: 1000 }, runtime);
    return { nodes: r.nodes, edges: r.edges };
  }

  async shortestPath(
    from: string,
    to: string,
    runtime: RuntimeContext,
  ): Promise<TraversalPath | null> {
    if (from === to) {
      // Trivial path — return the seed alone with length 0.
      const conn = getAsDb();
      const [seed] = await conn
        .select({ typeKey: agsGraphNodes.typeKey, nodeKey: agsGraphNodes.nodeKey })
        .from(agsGraphNodes)
        .where(eq(agsGraphNodes.nodeKey, from))
        .limit(1);
      if (!seed) return null;
      return {
        nodes: [{ typeKey: seed.typeKey, id: seed.nodeKey }],
        edges: [],
        length: 0,
      };
    }
    const conn = getAsDb();
    const govFilter = runtime.governanceStatusFilter ?? ["active"];
    const govList = sql.join(
      govFilter.map((g) => sql`${g}`),
      sql`, `,
    );
    const maxDepth = 6;
    // Recursive BFS over the undirected adjacency view. Each walk
    // row keeps a JSON array of node ids on the path so we can
    // rebuild the full hop sequence once the destination is hit.
    // The `cycle_guard` text column repurposes Postgres' standard
    // cycle-detection pattern without requiring `WITH RECURSIVE ...
    // CYCLE` (PG14+) so the query stays portable.
    const rows = await conn.execute(sql`
      WITH RECURSIVE walk AS (
        SELECT
          n.id AS node_id,
          n.type_key,
          n.node_key,
          0::int AS depth,
          ARRAY[n.id]::int[] AS path_ids,
          ARRAY[]::int[] AS edge_ids
        FROM ${agsGraphNodes} n
        WHERE n.node_key = ${from}
          AND n.governance_status IN (${govList})
        UNION ALL
        SELECT
          n.id,
          n.type_key,
          n.node_key,
          w.depth + 1,
          w.path_ids || n.id,
          w.edge_ids || e.id
        FROM ${agsGraphEdges} e
        JOIN walk w
          ON (e.source_node_id = w.node_id OR e.target_node_id = w.node_id)
        JOIN ${agsGraphNodes} n
          ON n.id = CASE
            WHEN e.source_node_id = w.node_id THEN e.target_node_id
            ELSE e.source_node_id
          END
        WHERE w.depth < ${maxDepth}
          AND NOT (n.id = ANY(w.path_ids))
          AND n.governance_status IN (${govList})
          AND e.governance_status IN (${govList})
      )
      SELECT path_ids, edge_ids, depth
      FROM walk
      WHERE node_key = ${to}
      ORDER BY depth ASC
      LIMIT 1;
    `);
    const records =
      (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
      (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []);
    const row = records[0];
    if (!row) return null;
    const pathIds = Array.isArray(row.path_ids) ? (row.path_ids as number[]) : [];
    const edgeIds = Array.isArray(row.edge_ids) ? (row.edge_ids as number[]) : [];
    if (pathIds.length === 0) return null;

    // Hydrate node + edge identities in a single pair of round-trips.
    const nodeRows = await conn.execute(sql`
      SELECT id, type_key, node_key
      FROM ${agsGraphNodes}
      WHERE id IN (${sql.join(
        pathIds.map((id) => sql`${id}`),
        sql`, `,
      )});
    `);
    const nodeRecords =
      (nodeRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
      (Array.isArray(nodeRows) ? (nodeRows as Array<Record<string, unknown>>) : []);
    const nodeById = new Map<number, NodeIdentity>(
      nodeRecords.map((r) => [
        Number(r.id),
        { typeKey: String(r.type_key), id: String(r.node_key) },
      ]),
    );
    const nodes: NodeIdentity[] = pathIds
      .map((id) => nodeById.get(id))
      .filter((n): n is NodeIdentity => n != null);

    let edges: EdgeIdentity[] = [];
    if (edgeIds.length > 0) {
      const edgeRows = await conn.execute(sql`
        SELECT
          e.type_key AS edge_type_key,
          e.edge_key,
          e.id,
          sn.type_key AS src_type,
          sn.node_key AS src_key,
          tn.type_key AS tgt_type,
          tn.node_key AS tgt_key
        FROM ${agsGraphEdges} e
        JOIN ${agsGraphNodes} sn ON sn.id = e.source_node_id
        JOIN ${agsGraphNodes} tn ON tn.id = e.target_node_id
        WHERE e.id IN (${sql.join(
          edgeIds.map((id) => sql`${id}`),
          sql`, `,
        )});
      `);
      const edgeRecords =
        (edgeRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
        (Array.isArray(edgeRows) ? (edgeRows as Array<Record<string, unknown>>) : []);
      const edgeByRowId = new Map<number, EdgeIdentity>(
        edgeRecords.map((r) => [
          Number(r.id),
          {
            typeKey: String(r.edge_type_key),
            id: String(r.edge_key ?? ""),
            sourceNode: { typeKey: String(r.src_type), id: String(r.src_key) },
            targetNode: { typeKey: String(r.tgt_type), id: String(r.tgt_key) },
          },
        ]),
      );
      edges = edgeIds
        .map((id) => edgeByRowId.get(id))
        .filter((e): e is EdgeIdentity => e != null);
    }

    return {
      nodes,
      edges,
      length: Number(row.depth ?? edges.length),
    };
  }

  // ----- Projection sync -----

  async enqueueProjectionJob() {
    return { jobId: 0 };
  }
  async takeSnapshot(_scope: string) {
    return { snapshotId: "" };
  }
  async detectDrift(_scope: string) {
    return { driftEvents: [] };
  }
  async rebuildProjection(_scope: string): Promise<ProjectionResult> {
    return { nodesCreated: 0, nodesUpdated: 0, nodesDeleted: 0, edgesCreated: 0, edgesUpdated: 0, edgesDeleted: 0, durationMs: 0, errors: [] };
  }

  // ----- Query templates -----

  async executeTemplate(
    input: QueryTemplateExecutionInput,
  ): Promise<QueryTemplateExecutionResult> {
    // Slice 6 of the no-deferral catalogue. Look up the template row
    // from `ags_query_templates`, require a postgres-backend variant,
    // execute its body as parameterized SQL via the underlying pool.
    const startedAt = Date.now();
    const conn = getAsDb();

    // Prefer a postgres-tagged template; fall back to any row with
    // the matching key so legacy single-backend templates still run.
    const candidates = await conn
      .select()
      .from(agsQueryTemplates)
      .where(eq(agsQueryTemplates.templateKey, input.templateKey))
      .limit(5);
    const template =
      candidates.find((t) => t.graphBackend === "postgres") ?? candidates[0];
    if (!template) {
      throw new Error(
        `executeTemplate: template "${input.templateKey}" not found in ags_query_templates`,
      );
    }
    if (template.graphBackend !== "postgres") {
      throw new Error(
        `executeTemplate: template "${input.templateKey}" is bound to backend "${template.graphBackend}", not postgres. Register a row with graph_backend='postgres' for AsdbPostgresGraphRepository.`,
      );
    }
    if (!template.readOnly) {
      // Defense-in-depth: the dispatcher layer also gates this, but
      // the repository must refuse mutating templates so a misconfigured
      // row can't sneak through.
      throw new Error(
        `executeTemplate: template "${input.templateKey}" is not marked read-only; mutating templates are forbidden via this path.`,
      );
    }

    // Resolve bind args. `parameter_schema.ordered = ["a","b"]`
    // gives a deterministic order; otherwise fall back to sorted keys.
    const schema = (template.parameterSchema ?? {}) as {
      ordered?: unknown;
    };
    const orderedNames: string[] = Array.isArray(schema.ordered)
      ? (schema.ordered as unknown[]).map((s) => String(s))
      : Object.keys(input.parameters ?? {}).sort();
    const values = orderedNames.map((name) => input.parameters?.[name]);
    const maxResults = template.maxResults ?? 1000;

    // Drop down to the underlying pg pool for positional bind support.
    // Drizzle's `sql.raw(text)` doesn't bind, so the only way to safely
    // pass external values is the pool's `query(text, values)` API.
    const client = (conn as unknown as { $client?: { query: (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } }).$client;
    if (!client || typeof client.query !== "function") {
      throw new Error(
        "executeTemplate: underlying postgres client unavailable (drizzle.$client not exposed). Upgrade drizzle-orm or set DATABASE_URL_ASDB to a node-postgres-compatible URL.",
      );
    }
    const result = await client.query(template.cypherBody, values);
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    return {
      rows: rows.slice(0, maxResults),
      truncated: rows.length > maxResults,
      durationMs: Date.now() - startedAt,
      templateVersion: String(template.id ?? "1.0"),
    };
  }

  // ----- Algorithms -----

  async runAlgorithm() {
    return { rows: [], durationMs: 0 };
  }

  // ----- Permissions -----

  async filterByPermissions<T extends NodeIdentity>(nodes: T[], runtime: RuntimeContext): Promise<T[]> {
    if (!nodes.length) return nodes;
    const conn = getAsDb();
    const govFilter = runtime.governanceStatusFilter ?? ["active"];
    // See `localGraph` for the Drizzle array-spread caveat.
    const nodeKeyList = sql.join(
      nodes.map((n) => sql`${n.id}`),
      sql`, `,
    );
    const govList = sql.join(
      govFilter.map((g) => sql`${g}`),
      sql`, `,
    );
    const visible = await conn
      .select({ nodeKey: agsGraphNodes.nodeKey })
      .from(agsGraphNodes)
      .where(
        sql`${agsGraphNodes.nodeKey} IN (${nodeKeyList})
            AND ${agsGraphNodes.governanceStatus} IN (${govList})`,
      );
    const visibleSet = new Set(visible.map((v) => v.nodeKey));
    return nodes.filter((n) => visibleSet.has(n.id));
  }

  async isVisibleToUser(nodeId: string, runtime: RuntimeContext): Promise<boolean> {
    const filtered = await this.filterByPermissions([{ typeKey: "", id: nodeId }], runtime);
    return filtered.length > 0;
  }

  // ----- Explain -----

  async explainPath() {
    return { path: null };
  }
  async explainNode(nodeId: string) {
    const conn = getAsDb();
    const [row] = await conn
      .select()
      .from(agsGraphNodes)
      .where(eq(agsGraphNodes.nodeKey, nodeId))
      .limit(1);
    if (!row) return null;
    return {
      node: { typeKey: row.typeKey, id: row.nodeKey },
      properties: {},
      provenance: {
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceVersionId: row.sourceVersionId ?? undefined,
        lineageStatus: "derived" as const,
        governanceStatus: (row.governanceStatus ?? "active") as "active",
      },
    };
  }

  // ----- Benchmark -----

  async runBenchmark(scenario: Parameters<GraphRepository["runBenchmark"]>[0], iterations: number) {
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
    try {
      const conn = getAsDb();
      await conn.execute(sql`SELECT 1`);
      return { status: "healthy", latencyMs: 0, capabilities: this.capabilities };
    } catch (e) {
      return {
        status: "unavailable",
        errors: [e instanceof Error ? e.message : String(e)],
        capabilities: this.capabilities,
      };
    }
  }
}
