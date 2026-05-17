/**
 * Security / DevSecOps lens — ASDB reader (T-G.3.5).
 *
 * Reads from the security-graph persistence layer (T-G.3.3):
 *   - ags_security_graph_ingestions — picks the most-recent
 *     completed ingestion (per sourceKey scope, or globally)
 *   - ags_security_graph_nodes — nodes for that ingestion
 *   - ags_security_graph_edges — edges for that ingestion
 *
 * Returns the rows in the persistence layer's `SecurityGraphNode`
 * / `SecurityGraphEdge` shape — the lens-runner builder converts
 * to LensSnapshot.
 *
 * Mirrors `code-intelligence-lens-asdb-reader.ts` line-for-line
 * with the security-graph table names — precedent (r) carry-
 * forward (same reader shape across closed-taxonomy domains).
 *
 * Hard-rule compliance:
 *   - No neo4j-driver / dispatchMcpToolCall / openrouter / process.env.
 *   - Reads only the ags_security_graph_* tables.
 */

import { and, desc, eq } from "drizzle-orm";

import {
  agsSecurityGraphEdges,
  agsSecurityGraphIngestions,
  agsSecurityGraphNodes,
} from "../../../../../drizzle/tables/agent-studio-security-graph.js";
import { getAsDb } from "../../../db/connection.js";
import type {
  SecurityGraphEdgeType,
  SecurityGraphNodeType,
} from "../../security-graph/contracts.js";
import type {
  SecurityGraphEdge,
  SecurityGraphNode,
} from "../../security-graph/persistence/security-graph-store.js";

export interface SecurityDevSecOpsLensReadParams {
  /** Optional sourceKey scope ("nvd" / "ghsa" / scanner-id). When
   *  null, the reader picks the most-recent completed ingestion
   *  across all sources. */
  readonly sourceKey?: string | null;
  readonly limit: number;
}

export interface SecurityDevSecOpsLensReadResult {
  readonly ingestionId: string | null;
  readonly sourceKey: string | null;
  readonly nodes: ReadonlyArray<SecurityGraphNode>;
  readonly edges: ReadonlyArray<SecurityGraphEdge>;
  readonly truncated: boolean;
}

export type SecurityDevSecOpsLensReadFn = (
  params: SecurityDevSecOpsLensReadParams,
) => Promise<SecurityDevSecOpsLensReadResult>;

export const readSecurityDevSecOpsLensFromAsdb: SecurityDevSecOpsLensReadFn = async (
  params,
) => {
  const conn = getAsDb();
  if (!conn) throw new Error("ASDB unavailable");

  const ingestionRow = params.sourceKey
    ? (
        await conn
          .select({
            ingestionId: agsSecurityGraphIngestions.ingestionId,
            sourceKey: agsSecurityGraphIngestions.sourceKey,
          })
          .from(agsSecurityGraphIngestions)
          .where(
            and(
              eq(agsSecurityGraphIngestions.sourceKey, params.sourceKey),
              eq(agsSecurityGraphIngestions.status, "complete"),
            ),
          )
          .orderBy(desc(agsSecurityGraphIngestions.completedAt))
          .limit(1)
      )[0]
    : (
        await conn
          .select({
            ingestionId: agsSecurityGraphIngestions.ingestionId,
            sourceKey: agsSecurityGraphIngestions.sourceKey,
          })
          .from(agsSecurityGraphIngestions)
          .where(eq(agsSecurityGraphIngestions.status, "complete"))
          .orderBy(desc(agsSecurityGraphIngestions.completedAt))
          .limit(1)
      )[0];

  if (!ingestionRow) {
    return {
      ingestionId: null,
      sourceKey: params.sourceKey ?? null,
      nodes: [],
      edges: [],
      truncated: false,
    };
  }

  const nodeRows = await conn
    .select()
    .from(agsSecurityGraphNodes)
    .where(eq(agsSecurityGraphNodes.ingestionId, ingestionRow.ingestionId))
    .limit(params.limit + 1);

  const truncated = nodeRows.length > params.limit;
  const nodes: ReadonlyArray<SecurityGraphNode> = nodeRows
    .slice(0, params.limit)
    .map((r) => ({
      id: r.nodeId,
      typeKey: r.typeKey as SecurityGraphNodeType,
      name: r.name,
      properties: r.properties ?? undefined,
    }));

  // CVE graphs are more sparsely connected than code graphs;
  // 3× edge cap relative to node limit suffices for typical
  // CVE → Package → Component fan-out.
  const edgeCap = params.limit * 3;
  const edgeRows = await conn
    .select()
    .from(agsSecurityGraphEdges)
    .where(eq(agsSecurityGraphEdges.ingestionId, ingestionRow.ingestionId))
    .limit(edgeCap + 1);

  const edgesTruncated = edgeRows.length > edgeCap;
  const edges: ReadonlyArray<SecurityGraphEdge> = edgeRows
    .slice(0, edgeCap)
    .map((r) => ({
      id: r.edgeId,
      sourceId: r.sourceNodeId,
      edgeTypeKey: r.edgeTypeKey as SecurityGraphEdgeType,
      targetId: r.targetNodeId,
      properties: r.properties ?? undefined,
    }));

  return {
    ingestionId: ingestionRow.ingestionId,
    sourceKey: ingestionRow.sourceKey,
    nodes,
    edges,
    truncated: truncated || edgesTruncated,
  };
};
