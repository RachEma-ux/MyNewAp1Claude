/**
 * Security Graph ASDB Persistence — production interface + wiring.
 *
 * Surface contract pinned at T-G.3.1. T-G.3.3 (this PR) wires the
 * factory to an ASDB-backed implementation:
 *
 *   - Drizzle upsert into `ags_security_graph_ingestions` (run row)
 *   - Batched upsert into `ags_security_graph_nodes` (composite-
 *     unique on (ingestion_id, node_id) — idempotent on re-ingest)
 *   - Validated batched upsert into `ags_security_graph_edges`
 *     (rejects malformed edges via `validateSecurityGraphEdgeBatch`
 *     against the closed-taxonomy edge-constraint registry BEFORE
 *     writing)
 *
 * Same shape as T-G.2.3's code-graph persistence — precedent (r)
 * carry-forward + uniform "rejections-by-reason" telemetry.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Drizzle imports allowed here (this IS the persistence layer).
 *   - No `neo4j-driver` import (projection owns that boundary).
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

import { desc, eq, sql } from "drizzle-orm";

import {
  agsSecurityGraphEdges,
  agsSecurityGraphIngestions,
  agsSecurityGraphNodes,
} from "../../../../../drizzle/tables/agent-studio-security-graph.js";
import { getAsDb } from "../../../db/connection.js";
import {
  isSecurityGraphEdgeType,
  isSecurityGraphNodeType,
  validateSecurityGraphEdgeBatch,
  type SecurityGraphEdgeType,
  type SecurityGraphNodeType,
} from "../contracts.js";

export interface SecurityGraphNode {
  readonly id: string;
  readonly typeKey: SecurityGraphNodeType;
  readonly name: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SecurityGraphEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly edgeTypeKey: SecurityGraphEdgeType;
  readonly targetId: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface SecurityGraphIngestionInput {
  /** Operator-chosen stable id for this ingestion run. Typically
   *  `nvd::${ISO-timestamp}` or `${scanner-id}::${run-id}`. */
  readonly ingestionId: string;
  /** Identifies the feed source for audit + reconciliation. */
  readonly sourceKey: string;
  readonly nodes: ReadonlyArray<SecurityGraphNode>;
  readonly edges: ReadonlyArray<SecurityGraphEdge>;
}

export interface SecurityGraphIngestionResult {
  readonly ingestionId: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  /** Edges rejected by `validateSecurityGraphEdgeBatch` before
   *  reaching the DB. Same shape as T-G.2's persistence layer
   *  surfaces. */
  readonly edgesRejected: number;
}

/**
 * One row in the operator dashboard's ingestion list — denormalized
 * snapshot of `agsSecurityGraphIngestions` for display + drill-in.
 * Mirrors `CodeGraphIngestionListRow` shape so the dashboard
 * composition is uniform across both graphs.
 */
export interface SecurityGraphIngestionListRow {
  readonly ingestionId: string;
  readonly sourceKey: string;
  readonly status: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  readonly edgesRejected: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * One reason+count entry in the rejection-by-reason rollup. Persistence
 * stores rejections as a count map (`{ reason: count }`) on each
 * ingestion's `metadata.rejectionsByReason`; this row shape carries
 * the unioned + source-attributed flatten of that map across recent
 * ingestions. Operators see "schema_violation: 12 across 3 NVD runs"
 * for triage.
 */
export interface SecurityGraphRecentRejectionRow {
  readonly ingestionId: string;
  readonly sourceKey: string;
  readonly reason: string;
  readonly count: number;
  /** Temporal anchor — `startedAt` of the parent ingestion. */
  readonly ingestionStartedAt: Date;
}

/**
 * Per-source-key summary row — most-recent ingestion's status +
 * counts + freshness, keyed by `sourceKey`. Used by the operator
 * dashboard's "feed freshness" panel to decide which security
 * feeds need re-ingest (the cron trigger). Mirrors
 * `CodeGraphRepositorySummaryRow` shape with `sourceKey`
 * substituting for `repositoryId`.
 */
export interface SecurityGraphSourceSummaryRow {
  readonly sourceKey: string;
  readonly latestIngestionId: string;
  readonly latestStatus: string;
  readonly latestNodesUpserted: number;
  readonly latestEdgesUpserted: number;
  readonly latestEdgesRejected: number;
  readonly latestStartedAt: Date;
  readonly latestCompletedAt: Date | null;
  readonly totalIngestionCount: number;
}

/**
 * Per-ingestion drill-in stats — counts only, no rows. Mirrors
 * `CodeGraphIngestionStats` shape.
 */
export interface SecurityGraphIngestionStats {
  readonly ingestionId: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeTypeCounts: ReadonlyArray<{
    readonly typeKey: string;
    readonly count: number;
  }>;
  readonly edgeTypeCounts: ReadonlyArray<{
    readonly edgeTypeKey: string;
    readonly count: number;
  }>;
}

export interface SecurityGraphStore {
  /**
   * Persist a parsed batch into ASDB. Idempotent on re-ingest of
   * the same `ingestionId` (composite-unique on
   * `(ingestion_id, node_id)` and `(ingestion_id, edge_id)` —
   * the T-G.2.3 idempotency pattern carries forward).
   */
  persistIngestion(
    input: SecurityGraphIngestionInput,
  ): Promise<SecurityGraphIngestionResult>;

  /**
   * Read all rows for a given ingestion. T-G.3.4's projection
   * reads from here so the Neo4j writes are derived.
   */
  readIngestion(ingestionId: string): Promise<{
    readonly nodes: ReadonlyArray<SecurityGraphNode>;
    readonly edges: ReadonlyArray<SecurityGraphEdge>;
  }>;

  /**
   * Operator dashboard surface — list recent ingestions newest-first.
   * T-G.3.α (securityGraph tRPC) consumer.
   */
  listIngestions(limit: number): Promise<
    ReadonlyArray<SecurityGraphIngestionListRow>
  >;

  /**
   * Per-ingestion typeKey breakdown — counts only. Returns null if
   * the ingestion row doesn't exist.
   */
  getIngestionStats(
    ingestionId: string,
  ): Promise<SecurityGraphIngestionStats | null>;

  /**
   * Operator drill-in — sample rows from `ags_security_graph_nodes`
   * scoped to one ingestion. Filterable by `typeKey`. Mirrors
   * `CodeGraphStore.listIngestionNodes`.
   */
  listIngestionNodes(input: {
    readonly ingestionId: string;
    readonly typeKey?: string;
    readonly limit: number;
  }): Promise<ReadonlyArray<SecurityGraphNode>>;

  /**
   * Operator drill-in — sample rows from `ags_security_graph_edges`
   * scoped to one ingestion. Filterable by `edgeTypeKey`.
   */
  listIngestionEdges(input: {
    readonly ingestionId: string;
    readonly edgeTypeKey?: string;
    readonly limit: number;
  }): Promise<ReadonlyArray<SecurityGraphEdge>>;

  /**
   * Operator dashboard — per-source-key summary keyed on the
   * most-recent ingestion. Newest-first by latestStartedAt.
   * Mirrors `CodeGraphStore.listRepositories`.
   */
  listSources(limit: number): Promise<
    ReadonlyArray<SecurityGraphSourceSummaryRow>
  >;

  /**
   * Operator dashboard — recent rejections unioned across the
   * most-recent ingestions. Each ingestion stores rejections as a
   * count map on `metadata.rejectionsByReason`; this method
   * flattens those out with source context. Newest-first by
   * `ingestionStartedAt`, then by `reason` for deterministic order.
   * Capped by `ingestionLimit` (ingestions scanned) and `rowLimit`
   * (total rows returned).
   */
  listRecentRejectionsByReason(input: {
    readonly ingestionLimit: number;
    readonly rowLimit: number;
  }): Promise<ReadonlyArray<SecurityGraphRecentRejectionRow>>;
}

/**
 * Factory entry point. Returns the ASDB-backed SecurityGraphStore.
 * Mirrors T-G.2.3's code-graph store shape line-for-line — the
 * validator runs BEFORE write so malformed edges never reach the
 * DB; rejection counts surface in metadata.
 */
export function createSecurityGraphStore(): SecurityGraphStore {
  return {
    async persistIngestion(
      input: SecurityGraphIngestionInput,
    ): Promise<SecurityGraphIngestionResult> {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");

      // Filter nodes to the closed taxonomy.
      const validNodes = input.nodes.filter((n) => isSecurityGraphNodeType(n.typeKey));
      const unknownNodeTypeCount = input.nodes.length - validNodes.length;

      // Validate edges against the closed-taxonomy registry.
      const edgeBatch = input.edges.map((e) => ({
        sourceTypeKey: lookupNodeTypeKey(input.nodes, e.sourceId) ?? "",
        edgeTypeKey: e.edgeTypeKey,
        targetTypeKey: lookupNodeTypeKey(input.nodes, e.targetId) ?? "",
        edgeId: e.id,
      }));
      const validation = validateSecurityGraphEdgeBatch(edgeBatch);
      const acceptedIds = new Set(validation.acceptedEdgeIds);
      const validEdges = input.edges.filter(
        (e) => isSecurityGraphEdgeType(e.edgeTypeKey) && acceptedIds.has(e.id),
      );

      const startedAt = new Date();

      // Upsert ingestion row.
      await conn
        .insert(agsSecurityGraphIngestions)
        .values({
          ingestionId: input.ingestionId,
          sourceKey: input.sourceKey,
          status: "writing",
          nodesUpserted: 0,
          edgesUpserted: 0,
          edgesRejected: 0,
          startedAt,
          metadata: {
            unknownNodeTypeCount,
            rejectionsByReason: validation.rejectionsByReason,
          },
        })
        .onConflictDoUpdate({
          target: agsSecurityGraphIngestions.ingestionId,
          set: {
            status: "writing",
            sourceKey: input.sourceKey,
            startedAt,
            completedAt: null,
            metadata: {
              unknownNodeTypeCount,
              rejectionsByReason: validation.rejectionsByReason,
            },
          },
        });

      // Batched upsert nodes.
      let nodesUpserted = 0;
      for (let i = 0; i < validNodes.length; i += PERSIST_BATCH_SIZE) {
        const chunk = validNodes.slice(i, i + PERSIST_BATCH_SIZE);
        await conn
          .insert(agsSecurityGraphNodes)
          .values(
            chunk.map((n) => ({
              ingestionId: input.ingestionId,
              nodeId: n.id,
              typeKey: n.typeKey as SecurityGraphNodeType,
              name: n.name,
              properties: n.properties as Record<string, unknown> | undefined,
            })),
          )
          .onConflictDoUpdate({
            target: [agsSecurityGraphNodes.ingestionId, agsSecurityGraphNodes.nodeId],
            set: {
              typeKey: agsSecurityGraphNodes.typeKey,
              name: agsSecurityGraphNodes.name,
              properties: agsSecurityGraphNodes.properties,
              updatedAt: new Date(),
            },
          });
        nodesUpserted += chunk.length;
      }

      // Batched upsert edges.
      let edgesUpserted = 0;
      for (let i = 0; i < validEdges.length; i += PERSIST_BATCH_SIZE) {
        const chunk = validEdges.slice(i, i + PERSIST_BATCH_SIZE);
        await conn
          .insert(agsSecurityGraphEdges)
          .values(
            chunk.map((e) => ({
              ingestionId: input.ingestionId,
              edgeId: e.id,
              sourceNodeId: e.sourceId,
              edgeTypeKey: e.edgeTypeKey as SecurityGraphEdgeType,
              targetNodeId: e.targetId,
              properties: e.properties as Record<string, unknown> | undefined,
            })),
          )
          .onConflictDoUpdate({
            target: [agsSecurityGraphEdges.ingestionId, agsSecurityGraphEdges.edgeId],
            set: {
              sourceNodeId: agsSecurityGraphEdges.sourceNodeId,
              edgeTypeKey: agsSecurityGraphEdges.edgeTypeKey,
              targetNodeId: agsSecurityGraphEdges.targetNodeId,
              properties: agsSecurityGraphEdges.properties,
              updatedAt: new Date(),
            },
          });
        edgesUpserted += chunk.length;
      }

      const edgesRejected = input.edges.length - edgesUpserted;
      const completedAt = new Date();

      await conn
        .update(agsSecurityGraphIngestions)
        .set({
          status: "complete",
          nodesUpserted,
          edgesUpserted,
          edgesRejected,
          completedAt,
        })
        .where(eq(agsSecurityGraphIngestions.ingestionId, input.ingestionId));

      return {
        ingestionId: input.ingestionId,
        nodesUpserted,
        edgesUpserted,
        edgesRejected,
      };
    },

    async readIngestion(ingestionId: string) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const [nodeRows, edgeRows] = await Promise.all([
        conn
          .select()
          .from(agsSecurityGraphNodes)
          .where(eq(agsSecurityGraphNodes.ingestionId, ingestionId)),
        conn
          .select()
          .from(agsSecurityGraphEdges)
          .where(eq(agsSecurityGraphEdges.ingestionId, ingestionId)),
      ]);
      const nodes: ReadonlyArray<SecurityGraphNode> = nodeRows.map((r) => ({
        id: r.nodeId,
        typeKey: r.typeKey as SecurityGraphNodeType,
        name: r.name,
        properties: r.properties ?? undefined,
      }));
      const edges: ReadonlyArray<SecurityGraphEdge> = edgeRows.map((r) => ({
        id: r.edgeId,
        sourceId: r.sourceNodeId,
        edgeTypeKey: r.edgeTypeKey as SecurityGraphEdgeType,
        targetId: r.targetNodeId,
        properties: r.properties ?? undefined,
      }));
      return { nodes, edges };
    },

    async listRecentRejectionsByReason(input) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      // Prefilter ingestions where edgesRejected > 0 so we don't
      // scan ingestions with no rejections to flatten. Each
      // ingestion's metadata.rejectionsByReason is a small
      // count-map; total iteration is bounded by ingestionLimit ×
      // (unique reasons per ingestion).
      const ingestions = await conn
        .select({
          ingestionId: agsSecurityGraphIngestions.ingestionId,
          sourceKey: agsSecurityGraphIngestions.sourceKey,
          startedAt: agsSecurityGraphIngestions.startedAt,
          metadata: agsSecurityGraphIngestions.metadata,
          edgesRejected: agsSecurityGraphIngestions.edgesRejected,
        })
        .from(agsSecurityGraphIngestions)
        .where(sql`${agsSecurityGraphIngestions.edgesRejected} > 0`)
        .orderBy(desc(agsSecurityGraphIngestions.startedAt))
        .limit(input.ingestionLimit);

      const out: SecurityGraphRecentRejectionRow[] = [];
      for (const row of ingestions) {
        const metadata = row.metadata as
          | { rejectionsByReason?: unknown }
          | null;
        const rawMap = metadata?.rejectionsByReason;
        if (!rawMap || typeof rawMap !== "object") continue;
        // Sort reasons for deterministic order within ingestion.
        const reasonEntries = Object.entries(
          rawMap as Record<string, unknown>,
        )
          .filter(([, v]) => typeof v === "number" && (v as number) > 0)
          .sort(([a], [b]) => a.localeCompare(b));
        for (const [reason, countRaw] of reasonEntries) {
          if (out.length >= input.rowLimit) break;
          out.push({
            ingestionId: row.ingestionId,
            sourceKey: row.sourceKey,
            reason,
            count: Number(countRaw),
            ingestionStartedAt: row.startedAt,
          });
        }
        if (out.length >= input.rowLimit) break;
      }
      return out;
    },

    async listSources(limit: number) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      // DISTINCT ON pattern mirrors code-graph's listRepositories —
      // one round-trip per side, joined in JS via a Map. Postgres-
      // specific, but matches the existing pattern elsewhere in this
      // codebase.
      const latestRows = (await conn.execute(sql`
        SELECT DISTINCT ON (source_key)
          source_key,
          ingestion_id,
          status,
          nodes_upserted,
          edges_upserted,
          edges_rejected,
          started_at,
          completed_at
        FROM ags_security_graph_ingestions
        ORDER BY source_key, started_at DESC
      `)) as unknown as {
        rows: ReadonlyArray<{
          source_key: string;
          ingestion_id: string;
          status: string;
          nodes_upserted: number;
          edges_upserted: number;
          edges_rejected: number;
          started_at: Date;
          completed_at: Date | null;
        }>;
      };
      const totalRows = (await conn.execute(sql`
        SELECT source_key, cast(count(*) as int) AS total
        FROM ags_security_graph_ingestions
        GROUP BY source_key
      `)) as unknown as {
        rows: ReadonlyArray<{ source_key: string; total: number }>;
      };
      const totalBySource = new Map<string, number>();
      for (const r of totalRows.rows) {
        totalBySource.set(r.source_key, Number(r.total));
      }
      const merged: SecurityGraphSourceSummaryRow[] = latestRows.rows.map(
        (r) => ({
          sourceKey: r.source_key,
          latestIngestionId: r.ingestion_id,
          latestStatus: r.status,
          latestNodesUpserted: r.nodes_upserted,
          latestEdgesUpserted: r.edges_upserted,
          latestEdgesRejected: r.edges_rejected,
          latestStartedAt: r.started_at,
          latestCompletedAt: r.completed_at,
          totalIngestionCount: totalBySource.get(r.source_key) ?? 0,
        }),
      );
      merged.sort(
        (a, b) => b.latestStartedAt.getTime() - a.latestStartedAt.getTime(),
      );
      return merged.slice(0, limit);
    },

    async listIngestionNodes(input) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const whereClause =
        input.typeKey !== undefined
          ? sql`${agsSecurityGraphNodes.ingestionId} = ${input.ingestionId} AND ${agsSecurityGraphNodes.typeKey} = ${input.typeKey}`
          : eq(agsSecurityGraphNodes.ingestionId, input.ingestionId);
      const rows = await conn
        .select()
        .from(agsSecurityGraphNodes)
        .where(whereClause)
        .orderBy(agsSecurityGraphNodes.nodeId)
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.nodeId,
        typeKey: r.typeKey as SecurityGraphNodeType,
        name: r.name,
        properties: r.properties ?? undefined,
      }));
    },

    async listIngestionEdges(input) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const whereClause =
        input.edgeTypeKey !== undefined
          ? sql`${agsSecurityGraphEdges.ingestionId} = ${input.ingestionId} AND ${agsSecurityGraphEdges.edgeTypeKey} = ${input.edgeTypeKey}`
          : eq(agsSecurityGraphEdges.ingestionId, input.ingestionId);
      const rows = await conn
        .select()
        .from(agsSecurityGraphEdges)
        .where(whereClause)
        .orderBy(agsSecurityGraphEdges.edgeId)
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.edgeId,
        sourceId: r.sourceNodeId,
        edgeTypeKey: r.edgeTypeKey as SecurityGraphEdgeType,
        targetId: r.targetNodeId,
        properties: r.properties ?? undefined,
      }));
    },

    async listIngestions(limit: number) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const rows = await conn
        .select()
        .from(agsSecurityGraphIngestions)
        .orderBy(desc(agsSecurityGraphIngestions.startedAt))
        .limit(limit);
      return rows.map((r) => ({
        ingestionId: r.ingestionId,
        sourceKey: r.sourceKey,
        status: r.status,
        nodesUpserted: r.nodesUpserted,
        edgesUpserted: r.edgesUpserted,
        edgesRejected: r.edgesRejected,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      }));
    },

    async getIngestionStats(ingestionId: string) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const ingestionRows = await conn
        .select({ id: agsSecurityGraphIngestions.id })
        .from(agsSecurityGraphIngestions)
        .where(eq(agsSecurityGraphIngestions.ingestionId, ingestionId))
        .limit(1);
      if (ingestionRows.length === 0) return null;

      const nodeCounts = await conn
        .select({
          typeKey: agsSecurityGraphNodes.typeKey,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsSecurityGraphNodes)
        .where(eq(agsSecurityGraphNodes.ingestionId, ingestionId))
        .groupBy(agsSecurityGraphNodes.typeKey);
      const edgeCounts = await conn
        .select({
          edgeTypeKey: agsSecurityGraphEdges.edgeTypeKey,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsSecurityGraphEdges)
        .where(eq(agsSecurityGraphEdges.ingestionId, ingestionId))
        .groupBy(agsSecurityGraphEdges.edgeTypeKey);

      const nodeCount = nodeCounts.reduce((a, r) => a + Number(r.count), 0);
      const edgeCount = edgeCounts.reduce((a, r) => a + Number(r.count), 0);

      return {
        ingestionId,
        nodeCount,
        edgeCount,
        nodeTypeCounts: nodeCounts
          .map((r) => ({ typeKey: r.typeKey, count: Number(r.count) }))
          .sort((a, b) => b.count - a.count),
        edgeTypeCounts: edgeCounts
          .map((r) => ({ edgeTypeKey: r.edgeTypeKey, count: Number(r.count) }))
          .sort((a, b) => b.count - a.count),
      };
    },
  };
}

/**
 * Postgres parameter-cap safe batch size — same constant as
 * T-G.2.3's PERSIST_BATCH_SIZE. ~7 params per row × 500 = 3500
 * params, well under the 65535 cap.
 */
const PERSIST_BATCH_SIZE = 500;

function lookupNodeTypeKey(
  nodes: ReadonlyArray<SecurityGraphNode>,
  nodeId: string,
): string | null {
  for (const n of nodes) {
    if (n.id === nodeId) return n.typeKey;
  }
  return null;
}
