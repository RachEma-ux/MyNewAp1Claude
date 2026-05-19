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

    // Edge sample — return edges where AT LEAST one endpoint is in
    // the sampled node set. Boundary nodes (the outside-sample
    // endpoints) are added to the result's `nodes` array so the
    // viz can draw the edge without a dangling reference. This
    // closes PR #1526's "boundary-node fetch" out-of-scope note.
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
      WHERE (sn.node_key IN (${sampledKeyList})
             OR tn.node_key IN (${sampledKeyList}))
        AND e.governance_status IN (${govList})
        AND sn.governance_status IN (${govList})
        AND tn.governance_status IN (${govList})
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

    // Boundary nodes — any edge endpoint we discovered that wasn't
    // already in the original sample. Add them so the viz can
    // render the connection without a dangling reference. These
    // are clearly labeled "boundary" so the operator UI can shade
    // them differently from the primary sample.
    const sampledIds = new Set(nodes.map((n) => n.id));
    const boundary = new Map<string, NodeIdentity>();
    for (const e of edges) {
      if (!sampledIds.has(e.sourceNode.id) && !boundary.has(e.sourceNode.id)) {
        boundary.set(e.sourceNode.id, e.sourceNode);
      }
      if (!sampledIds.has(e.targetNode.id) && !boundary.has(e.targetNode.id)) {
        boundary.set(e.targetNode.id, e.targetNode);
      }
    }
    const allNodes: NodeIdentity[] = [...nodes, ...boundary.values()];

    return {
      nodes: allNodes,
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

  async shortestPath(_from: string, _to: string, _runtime: RuntimeContext): Promise<TraversalPath | null> {
    return null;
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

  async executeTemplate(_input: QueryTemplateExecutionInput): Promise<QueryTemplateExecutionResult> {
    return { rows: [], truncated: false, durationMs: 0, templateVersion: "1.0" };
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
