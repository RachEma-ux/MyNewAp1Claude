/**
 * Code Intelligence lens — ASDB reader (T-G.2.5).
 *
 * Reads from the code-graph persistence layer (T-G.2.3):
 *   - ags_code_graph_ingestions: pick the most-recent completed
 *     ingestion (per repositoryId scope, or globally when no scope)
 *   - ags_code_graph_nodes: nodes for that ingestion
 *   - ags_code_graph_edges: edges for that ingestion
 *
 * Returns the rows in the parser's `ParsedCodeNode` / `ParsedCodeEdge`
 * shape — the lens-runner builder converts to LensSnapshot.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No neo4j-driver / openrouter / dispatchMcpToolCall.
 *   - Reads only the ags_code_graph_* tables; no cross-domain reads.
 */

import { and, desc, eq } from "drizzle-orm";

import {
  agsCodeGraphEdges,
  agsCodeGraphIngestions,
  agsCodeGraphNodes,
} from "../../../../../drizzle/tables/agent-studio-code-graph.js";
import { getAsDb } from "../../../db/connection.js";
import type {
  ParsedCodeEdge,
  ParsedCodeNode,
} from "../../code-graph/parser/code-graph-parser.js";
import type {
  CodeGraphEdgeType,
  CodeGraphNodeType,
} from "../../code-graph/contracts/public-api.js";

export interface CodeIntelligenceLensReadParams {
  /** Optional repositoryId scope. When null, the reader picks the
   *  most-recent completed ingestion across all repositories. */
  readonly repositoryId?: string | null;
  /** Soft cap on returned nodes; edges are capped at the same multiplier. */
  readonly limit: number;
}

export interface CodeIntelligenceLensReadResult {
  readonly ingestionId: string | null;
  readonly repositoryId: string | null;
  readonly nodes: ReadonlyArray<ParsedCodeNode>;
  readonly edges: ReadonlyArray<ParsedCodeEdge>;
  readonly truncated: boolean;
}

export type CodeIntelligenceLensReadFn = (
  params: CodeIntelligenceLensReadParams,
) => Promise<CodeIntelligenceLensReadResult>;

/**
 * Production read implementation backed by ASDB. The default
 * `CodeIntelligenceLensReadFn` for the installed runner — tests
 * pass a stub instead.
 */
export const readCodeIntelligenceLensFromAsdb: CodeIntelligenceLensReadFn = async (
  params,
) => {
  const conn = getAsDb();
  if (!conn) throw new Error("ASDB unavailable");

  // Pick the most-recent completed ingestion. When scoped by
  // repositoryId, prefer that repo; otherwise fall through to the
  // global latest.
  const ingestionRow = params.repositoryId
    ? (
        await conn
          .select({
            ingestionId: agsCodeGraphIngestions.ingestionId,
            repositoryId: agsCodeGraphIngestions.repositoryId,
          })
          .from(agsCodeGraphIngestions)
          .where(
            and(
              eq(agsCodeGraphIngestions.repositoryId, params.repositoryId),
              eq(agsCodeGraphIngestions.status, "complete"),
            ),
          )
          .orderBy(desc(agsCodeGraphIngestions.completedAt))
          .limit(1)
      )[0]
    : (
        await conn
          .select({
            ingestionId: agsCodeGraphIngestions.ingestionId,
            repositoryId: agsCodeGraphIngestions.repositoryId,
          })
          .from(agsCodeGraphIngestions)
          .where(eq(agsCodeGraphIngestions.status, "complete"))
          .orderBy(desc(agsCodeGraphIngestions.completedAt))
          .limit(1)
      )[0];

  if (!ingestionRow) {
    return {
      ingestionId: null,
      repositoryId: params.repositoryId ?? null,
      nodes: [],
      edges: [],
      truncated: false,
    };
  }

  const nodeRows = await conn
    .select()
    .from(agsCodeGraphNodes)
    .where(eq(agsCodeGraphNodes.ingestionId, ingestionRow.ingestionId))
    .limit(params.limit + 1);

  const truncated = nodeRows.length > params.limit;
  const nodes: ReadonlyArray<ParsedCodeNode> = nodeRows
    .slice(0, params.limit)
    .map((r) => ({
      id: r.nodeId,
      typeKey: r.typeKey as CodeGraphNodeType,
      name: r.name,
      filePath: r.filePath,
      startLine: r.startLine ?? undefined,
      endLine: r.endLine ?? undefined,
      properties: r.properties ?? undefined,
    }));

  // Edges capped at 4× nodes — typical fan-out for a code graph.
  // Avoids OOM on a heavily-imported file scan without forcing
  // operators to think about a separate edge limit.
  const edgeCap = params.limit * 4;
  const edgeRows = await conn
    .select()
    .from(agsCodeGraphEdges)
    .where(eq(agsCodeGraphEdges.ingestionId, ingestionRow.ingestionId))
    .limit(edgeCap + 1);

  const edgesTruncated = edgeRows.length > edgeCap;
  const edges: ReadonlyArray<ParsedCodeEdge> = edgeRows
    .slice(0, edgeCap)
    .map((r) => ({
      id: r.edgeId,
      sourceId: r.sourceNodeId,
      edgeTypeKey: r.edgeTypeKey as CodeGraphEdgeType,
      targetId: r.targetNodeId,
      properties: r.properties ?? undefined,
    }));

  return {
    ingestionId: ingestionRow.ingestionId,
    repositoryId: ingestionRow.repositoryId,
    nodes,
    edges,
    truncated: truncated || edgesTruncated,
  };
};
