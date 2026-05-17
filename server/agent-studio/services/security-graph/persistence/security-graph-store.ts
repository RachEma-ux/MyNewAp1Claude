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

import { eq } from "drizzle-orm";

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
