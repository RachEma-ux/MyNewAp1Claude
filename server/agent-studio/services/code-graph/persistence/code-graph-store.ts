/**
 * Code Graph ASDB Persistence — production interface + wiring.
 *
 * Surface contract pinned at T-G.2.1. T-G.2.3 (this PR) wires the
 * factory to an ASDB-backed implementation:
 *
 *   - Drizzle upsert into `ags_code_graph_ingestions` (run record)
 *   - Batched upsert into `ags_code_graph_nodes` (composite-unique
 *     on (ingestion_id, node_id) — idempotent on re-parse)
 *   - Validated batched upsert into `ags_code_graph_edges` (rejects
 *     malformed edges via `validateCodeGraphEdgeBatch` against the
 *     closed-taxonomy edge-constraint registry BEFORE writing)
 *
 * Source-of-truth invariant: every successful `persistIngestion`
 * call returns BEFORE any Neo4j write happens. The projection
 * layer (`projection/`, T-G.2.4) reads from ASDB and writes derived
 * facts to Neo4j — that's a separate explicit step.
 *
 * Re-ingest idempotency: the composite-unique indexes on
 * `(ingestion_id, node_id)` and `(ingestion_id, edge_id)` mean
 * upsert (ON CONFLICT DO UPDATE) overwrites in-place. Operators
 * can re-parse + re-persist with the same `ingestionId` to refresh
 * stale rows without duplicates.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Drizzle imports allowed here (this IS the persistence layer).
 *   - No `neo4j-driver` import (projection owns that boundary).
 *   - No `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads.
 */

import { desc, eq, sql } from "drizzle-orm";

import {
  agsCodeGraphIngestions,
  agsCodeGraphNodes,
  agsCodeGraphEdges,
} from "../../../../../drizzle/tables/agent-studio-code-graph.js";
import { getAsDb } from "../../../db/connection.js";
import {
  isCodeGraphEdgeType,
  isCodeGraphNodeType,
  validateCodeGraphEdgeBatch,
  type CodeGraphEdgeType,
  type CodeGraphNodeType,
} from "../contracts/public-api.js";
import type {
  ParsedCodeNode,
  ParsedCodeEdge,
  ParseError,
} from "../parser/code-graph-parser.js";

/**
 * One ingestion run = one repo-scan invocation. The store
 * idempotently upserts symbols keyed by `(ingestionId, node.id)` so
 * re-ingest doesn't duplicate. T-G.2.3 generates `ingestionId` per
 * run.
 */
export interface CodeGraphIngestionInput {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly nodes: ReadonlyArray<ParsedCodeNode>;
  readonly edges: ReadonlyArray<ParsedCodeEdge>;
  readonly errors: ReadonlyArray<ParseError>;
  /**
   * Optional re-ingest hints — persisted into `metadata.lastRun` so
   * the operator dashboard can fire a per-row re-ingest from the
   * freshness panel without forcing the operator to retype the path.
   * Not part of the closed-taxonomy contract; the store treats these
   * as opaque metadata.
   */
  readonly repoPath?: string;
  readonly relativeSubPath?: string;
}

export interface CodeGraphIngestionResult {
  readonly ingestionId: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  /** Edges rejected because (sourceTypeKey, edgeTypeKey, targetTypeKey)
   *  is not in the closed-taxonomy edge-constraint registry. The
   *  store calls `validateCodeGraphEdgeBatch` before persisting. */
  readonly edgesRejected: number;
  /** Surfaced verbatim from the parser. The store does not
   *  persist these — they're audit-trail telemetry for the
   *  orchestrator. */
  readonly parserErrorCount: number;
}

/**
 * One row in the operator dashboard's ingestion list — denormalized
 * snapshot of `agsCodeGraphIngestions` for display + drill-in.
 */
export interface CodeGraphIngestionListRow {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly status: string;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  readonly edgesRejected: number;
  readonly parserErrorCount: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * Per-ingestion parser-error audit row — surfaced verbatim from
 * `metadata.parserErrors` (which the store persists capped at 50
 * rows per ingestion to keep the metadata column bounded). Used by
 * the operator dashboard's "parser failures" panel for triage.
 *
 * `ingestionId` is attached at read-time so the rows can be unioned
 * across recent ingestions without losing source-of-record context.
 */
export interface CodeGraphRecentParserErrorRow {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly filePath: string;
  readonly reason: string;
  readonly message: string;
  /** `startedAt` of the parent ingestion — temporal anchor for triage. */
  readonly ingestionStartedAt: Date;
}

/**
 * Per-repository summary row — most-recent ingestion's status +
 * counts + freshness, keyed by `repositoryId`. Used by the operator
 * dashboard's "stale repos" panel to decide which repositories need
 * re-ingest (the cron trigger).
 */
export interface CodeGraphRepositorySummaryRow {
  readonly repositoryId: string;
  /** ingestionId of the most-recent run for this repo. */
  readonly latestIngestionId: string;
  /** Status of the most-recent run. */
  readonly latestStatus: string;
  /** Counts of the most-recent run. */
  readonly latestNodesUpserted: number;
  readonly latestEdgesUpserted: number;
  readonly latestEdgesRejected: number;
  /** `startedAt` of the most-recent run — freshness anchor. */
  readonly latestStartedAt: Date;
  /** `completedAt` of the most-recent run; null while still running. */
  readonly latestCompletedAt: Date | null;
  /** Total ingestion-row count for this repository, across all runs. */
  readonly totalIngestionCount: number;
  /**
   * Re-ingest hints extracted from the most-recent run's
   * `metadata.lastRun`. `null` when the source row was persisted
   * before the orchestrator started forwarding these (historical
   * rows). The dashboard renders a "Re-ingest" affordance when
   * `latestRunRepoPath !== null`.
   */
  readonly latestRunRepoPath: string | null;
  readonly latestRunRelativeSubPath: string | null;
}

/**
 * Per-ingestion drill-in stats — counts only, no rows. Operators
 * use this to see a typeKey breakdown without loading the full
 * symbol list. The list-of-typeKey-counts shape mirrors the
 * graph-quality stats panel so the dashboard composition is uniform.
 */
export interface CodeGraphIngestionStats {
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

export interface CodeGraphStore {
  /**
   * Persist a parsed batch into ASDB. Idempotent on re-ingest of
   * the same `ingestionId`. The store applies the closed-taxonomy
   * edge validation (`validateCodeGraphEdgeBatch`) before writing
   * so malformed edges never reach the DB.
   */
  persistIngestion(
    input: CodeGraphIngestionInput,
  ): Promise<CodeGraphIngestionResult>;

  /**
   * Read all symbols for a given ingestion run. T-G.2.4's
   * projection reads from here so the Neo4j writes are derived
   * (not authoritative).
   */
  readIngestion(ingestionId: string): Promise<{
    readonly nodes: ReadonlyArray<ParsedCodeNode>;
    readonly edges: ReadonlyArray<ParsedCodeEdge>;
  }>;

  /**
   * Operator dashboard surface — list recent ingestions newest-first.
   * Bounded by `limit` (clamped at the caller; this method trusts
   * the input). T-G.2.α (codeGraph tRPC) consumer.
   */
  listIngestions(limit: number): Promise<ReadonlyArray<CodeGraphIngestionListRow>>;

  /**
   * Per-ingestion typeKey breakdown — counts only. Used by the
   * drill-in panel after the operator picks an ingestion from
   * `listIngestions`. Returns `null` if the ingestion doesn't exist.
   */
  getIngestionStats(ingestionId: string): Promise<CodeGraphIngestionStats | null>;

  /**
   * Operator drill-in — sample rows from `ags_code_graph_nodes`
   * scoped to one ingestion. Filterable by `typeKey` so the
   * dashboard can drill from the stats panel directly into the
   * rows backing one bar. Capped by `limit` (caller clamps).
   */
  listIngestionNodes(input: {
    readonly ingestionId: string;
    readonly typeKey?: string;
    readonly limit: number;
  }): Promise<ReadonlyArray<ParsedCodeNode>>;

  /**
   * Operator drill-in — sample rows from `ags_code_graph_edges`
   * scoped to one ingestion. Filterable by `edgeTypeKey` so the
   * dashboard can drill from the edge-stats panel directly into
   * the rows backing one bar. Capped by `limit` (caller clamps).
   */
  listIngestionEdges(input: {
    readonly ingestionId: string;
    readonly edgeTypeKey?: string;
    readonly limit: number;
  }): Promise<ReadonlyArray<ParsedCodeEdge>>;

  /**
   * Operator dashboard — per-repository summary keyed on the
   * most-recent ingestion. Newest-first by latestStartedAt so the
   * stalest repos sink to the bottom. Capped by `limit` (caller
   * clamps). Used to drive the re-ingest cron decision.
   */
  listRepositories(limit: number): Promise<
    ReadonlyArray<CodeGraphRepositorySummaryRow>
  >;

  /**
   * Operator dashboard — recent parser errors unioned across the
   * most-recent ingestions (per ingestion row's `metadata.parserErrors`
   * audit list, capped at 50 by the persistence layer). Newest-first
   * by `ingestionStartedAt`, then by `filePath` for deterministic
   * order within an ingestion. Drives the "parser failures" panel
   * for triage.
   */
  listRecentParserErrors(input: {
    /** Cap on the number of ingestions scanned for parser errors. */
    readonly ingestionLimit: number;
    /** Cap on the total number of parser-error rows returned. */
    readonly errorLimit: number;
  }): Promise<ReadonlyArray<CodeGraphRecentParserErrorRow>>;
}

/**
 * Factory entry point. Returns the ASDB-backed CodeGraphStore.
 *
 * The store applies closed-taxonomy validation
 * (`validateCodeGraphEdgeBatch`) before persisting any edges, so
 * malformed (source/edge/target) triples never reach the DB.
 * Rejection counts surface in the `CodeGraphIngestionResult` and
 * the per-ingestion metadata column for operator dashboards.
 */
export function createCodeGraphStore(): CodeGraphStore {
  return {
    async persistIngestion(
      input: CodeGraphIngestionInput,
    ): Promise<CodeGraphIngestionResult> {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");

      // Filter nodes to the closed taxonomy. Unknown typeKeys are
      // dropped + counted in metadata (operator-visible drift signal).
      const validNodes = input.nodes.filter((n) => isCodeGraphNodeType(n.typeKey));
      const unknownNodeTypeCount = input.nodes.length - validNodes.length;

      // Validate edges in batch — reuses the same registry that
      // T-F.3 Impact Analysis Lens enforces.
      const edgeBatch = input.edges.map((e) => ({
        sourceTypeKey: lookupNodeTypeKey(input.nodes, e.sourceId) ?? "",
        edgeTypeKey: e.edgeTypeKey,
        targetTypeKey: lookupNodeTypeKey(input.nodes, e.targetId) ?? "",
        edgeId: e.id,
      }));
      const validation = validateCodeGraphEdgeBatch(edgeBatch);
      const acceptedIds = new Set(validation.acceptedEdgeIds);
      const validEdges = input.edges.filter(
        (e) => isCodeGraphEdgeType(e.edgeTypeKey) && acceptedIds.has(e.id),
      );

      const startedAt = new Date();

      // Re-ingest hints, persisted into metadata so the freshness
      // panel can fire a per-row Re-ingest without re-prompting the
      // operator for the path. Only included when the orchestrator
      // forwarded them (older callers may not).
      const lastRun: { repoPath: string; relativeSubPath?: string } | undefined =
        input.repoPath !== undefined
          ? {
              repoPath: input.repoPath,
              ...(input.relativeSubPath !== undefined
                ? { relativeSubPath: input.relativeSubPath }
                : {}),
            }
          : undefined;

      // Upsert ingestion row (composite-unique on ingestion_id).
      await conn
        .insert(agsCodeGraphIngestions)
        .values({
          ingestionId: input.ingestionId,
          repositoryId: input.repositoryId,
          status: "writing",
          nodesUpserted: 0,
          edgesUpserted: 0,
          edgesRejected: 0,
          parserErrorCount: input.errors.length,
          startedAt,
          metadata: {
            unknownNodeTypeCount,
            rejectionsByReason: validation.rejectionsByReason,
            parserErrors: input.errors.slice(0, 50),
            ...(lastRun !== undefined ? { lastRun } : {}),
          },
        })
        .onConflictDoUpdate({
          target: agsCodeGraphIngestions.ingestionId,
          set: {
            status: "writing",
            parserErrorCount: input.errors.length,
            startedAt,
            completedAt: null,
            metadata: {
              unknownNodeTypeCount,
              rejectionsByReason: validation.rejectionsByReason,
              parserErrors: input.errors.slice(0, 50),
              ...(lastRun !== undefined ? { lastRun } : {}),
            },
          },
        });

      // Batched upsert nodes — chunked at 500 rows/statement to keep
      // each parameterized INSERT well under Postgres's parameter cap.
      let nodesUpserted = 0;
      for (let i = 0; i < validNodes.length; i += PERSIST_BATCH_SIZE) {
        const chunk = validNodes.slice(i, i + PERSIST_BATCH_SIZE);
        await conn
          .insert(agsCodeGraphNodes)
          .values(
            chunk.map((n) => ({
              ingestionId: input.ingestionId,
              nodeId: n.id,
              typeKey: n.typeKey as CodeGraphNodeType,
              name: n.name,
              filePath: n.filePath,
              startLine: n.startLine,
              endLine: n.endLine,
              properties: n.properties as Record<string, unknown> | undefined,
            })),
          )
          .onConflictDoUpdate({
            target: [agsCodeGraphNodes.ingestionId, agsCodeGraphNodes.nodeId],
            set: {
              typeKey: agsCodeGraphNodes.typeKey,
              name: agsCodeGraphNodes.name,
              filePath: agsCodeGraphNodes.filePath,
              startLine: agsCodeGraphNodes.startLine,
              endLine: agsCodeGraphNodes.endLine,
              properties: agsCodeGraphNodes.properties,
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
          .insert(agsCodeGraphEdges)
          .values(
            chunk.map((e) => ({
              ingestionId: input.ingestionId,
              edgeId: e.id,
              sourceNodeId: e.sourceId,
              edgeTypeKey: e.edgeTypeKey as CodeGraphEdgeType,
              targetNodeId: e.targetId,
              properties: e.properties as Record<string, unknown> | undefined,
            })),
          )
          .onConflictDoUpdate({
            target: [agsCodeGraphEdges.ingestionId, agsCodeGraphEdges.edgeId],
            set: {
              sourceNodeId: agsCodeGraphEdges.sourceNodeId,
              edgeTypeKey: agsCodeGraphEdges.edgeTypeKey,
              targetNodeId: agsCodeGraphEdges.targetNodeId,
              properties: agsCodeGraphEdges.properties,
              updatedAt: new Date(),
            },
          });
        edgesUpserted += chunk.length;
      }

      const edgesRejected = input.edges.length - edgesUpserted;
      const completedAt = new Date();

      // Final ingestion row update.
      await conn
        .update(agsCodeGraphIngestions)
        .set({
          status: "complete",
          nodesUpserted,
          edgesUpserted,
          edgesRejected,
          completedAt,
        })
        .where(eq(agsCodeGraphIngestions.ingestionId, input.ingestionId));

      return {
        ingestionId: input.ingestionId,
        nodesUpserted,
        edgesUpserted,
        edgesRejected,
        parserErrorCount: input.errors.length,
      };
    },

    async readIngestion(ingestionId: string) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const [nodeRows, edgeRows] = await Promise.all([
        conn
          .select()
          .from(agsCodeGraphNodes)
          .where(eq(agsCodeGraphNodes.ingestionId, ingestionId)),
        conn
          .select()
          .from(agsCodeGraphEdges)
          .where(eq(agsCodeGraphEdges.ingestionId, ingestionId)),
      ]);
      const nodes: ReadonlyArray<ParsedCodeNode> = nodeRows.map((r) => ({
        id: r.nodeId,
        typeKey: r.typeKey as CodeGraphNodeType,
        name: r.name,
        filePath: r.filePath,
        startLine: r.startLine ?? undefined,
        endLine: r.endLine ?? undefined,
        properties: r.properties ?? undefined,
      }));
      const edges: ReadonlyArray<ParsedCodeEdge> = edgeRows.map((r) => ({
        id: r.edgeId,
        sourceId: r.sourceNodeId,
        edgeTypeKey: r.edgeTypeKey as CodeGraphEdgeType,
        targetId: r.targetNodeId,
        properties: r.properties ?? undefined,
      }));
      return { nodes, edges };
    },

    async listIngestions(limit: number) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const rows = await conn
        .select()
        .from(agsCodeGraphIngestions)
        .orderBy(desc(agsCodeGraphIngestions.startedAt))
        .limit(limit);
      return rows.map((r) => ({
        ingestionId: r.ingestionId,
        repositoryId: r.repositoryId,
        status: r.status,
        nodesUpserted: r.nodesUpserted,
        edgesUpserted: r.edgesUpserted,
        edgesRejected: r.edgesRejected,
        parserErrorCount: r.parserErrorCount,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      }));
    },

    async listRecentParserErrors(input) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      // Pull the most-recent N ingestions, then flatten parser-error
      // rows out of `metadata.parserErrors`. The metadata cap (50
      // rows per ingestion at persistence time) bounds the per-ingestion
      // explosion; the caller-supplied `errorLimit` caps the total
      // returned across all scanned ingestions.
      const ingestions = await conn
        .select({
          ingestionId: agsCodeGraphIngestions.ingestionId,
          repositoryId: agsCodeGraphIngestions.repositoryId,
          startedAt: agsCodeGraphIngestions.startedAt,
          metadata: agsCodeGraphIngestions.metadata,
          parserErrorCount: agsCodeGraphIngestions.parserErrorCount,
        })
        .from(agsCodeGraphIngestions)
        .where(sql`${agsCodeGraphIngestions.parserErrorCount} > 0`)
        .orderBy(desc(agsCodeGraphIngestions.startedAt))
        .limit(input.ingestionLimit);

      const out: CodeGraphRecentParserErrorRow[] = [];
      for (const row of ingestions) {
        const errors = Array.isArray(
          (row.metadata as Record<string, unknown> | null)?.parserErrors,
        )
          ? ((row.metadata as { parserErrors: ReadonlyArray<unknown> })
              .parserErrors as ReadonlyArray<{
              filePath?: unknown;
              reason?: unknown;
              message?: unknown;
            }>)
          : [];
        const sorted = [...errors].sort((a, b) => {
          const fa = typeof a.filePath === "string" ? a.filePath : "";
          const fb = typeof b.filePath === "string" ? b.filePath : "";
          return fa.localeCompare(fb);
        });
        for (const e of sorted) {
          if (out.length >= input.errorLimit) break;
          out.push({
            ingestionId: row.ingestionId,
            repositoryId: row.repositoryId,
            filePath: typeof e.filePath === "string" ? e.filePath : "",
            reason: typeof e.reason === "string" ? e.reason : "unknown",
            message: typeof e.message === "string" ? e.message : "",
            ingestionStartedAt: row.startedAt,
          });
        }
        if (out.length >= input.errorLimit) break;
      }
      return out;
    },

    async listRepositories(limit: number) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      // Pull the most-recent ingestion per repositoryId using a
      // DISTINCT ON pattern, then attach the per-repo total count
      // via a second aggregate. DISTINCT ON is Postgres-specific but
      // mirrors the pattern already used elsewhere in this codebase
      // (graph-quality stats) — keeps a single round trip per side.
      const latestRows = (await conn.execute(sql`
        SELECT DISTINCT ON (repository_id)
          repository_id,
          ingestion_id,
          status,
          nodes_upserted,
          edges_upserted,
          edges_rejected,
          started_at,
          completed_at,
          metadata
        FROM ags_code_graph_ingestions
        ORDER BY repository_id, started_at DESC
      `)) as unknown as {
        rows: ReadonlyArray<{
          repository_id: string;
          ingestion_id: string;
          status: string;
          nodes_upserted: number;
          edges_upserted: number;
          edges_rejected: number;
          started_at: Date;
          completed_at: Date | null;
          metadata: Record<string, unknown> | null;
        }>;
      };
      const totalRows = (await conn.execute(sql`
        SELECT repository_id, cast(count(*) as int) AS total
        FROM ags_code_graph_ingestions
        GROUP BY repository_id
      `)) as unknown as {
        rows: ReadonlyArray<{ repository_id: string; total: number }>;
      };
      const totalByRepo = new Map<string, number>();
      for (const r of totalRows.rows) {
        totalByRepo.set(r.repository_id, Number(r.total));
      }
      const merged: CodeGraphRepositorySummaryRow[] = latestRows.rows.map(
        (r) => {
          const lastRun = (r.metadata as Record<string, unknown> | null)?.[
            "lastRun"
          ] as { repoPath?: unknown; relativeSubPath?: unknown } | undefined;
          const latestRunRepoPath =
            typeof lastRun?.repoPath === "string" ? lastRun.repoPath : null;
          const latestRunRelativeSubPath =
            typeof lastRun?.relativeSubPath === "string"
              ? lastRun.relativeSubPath
              : null;
          return {
            repositoryId: r.repository_id,
            latestIngestionId: r.ingestion_id,
            latestStatus: r.status,
            latestNodesUpserted: r.nodes_upserted,
            latestEdgesUpserted: r.edges_upserted,
            latestEdgesRejected: r.edges_rejected,
            latestStartedAt: r.started_at,
            latestCompletedAt: r.completed_at,
            totalIngestionCount: totalByRepo.get(r.repository_id) ?? 0,
            latestRunRepoPath,
            latestRunRelativeSubPath,
          };
        },
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
          ? sql`${agsCodeGraphNodes.ingestionId} = ${input.ingestionId} AND ${agsCodeGraphNodes.typeKey} = ${input.typeKey}`
          : eq(agsCodeGraphNodes.ingestionId, input.ingestionId);
      const rows = await conn
        .select()
        .from(agsCodeGraphNodes)
        .where(whereClause)
        .orderBy(agsCodeGraphNodes.nodeId)
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.nodeId,
        typeKey: r.typeKey as CodeGraphNodeType,
        name: r.name,
        filePath: r.filePath,
        startLine: r.startLine ?? undefined,
        endLine: r.endLine ?? undefined,
        properties: r.properties ?? undefined,
      }));
    },

    async listIngestionEdges(input) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      const whereClause =
        input.edgeTypeKey !== undefined
          ? sql`${agsCodeGraphEdges.ingestionId} = ${input.ingestionId} AND ${agsCodeGraphEdges.edgeTypeKey} = ${input.edgeTypeKey}`
          : eq(agsCodeGraphEdges.ingestionId, input.ingestionId);
      const rows = await conn
        .select()
        .from(agsCodeGraphEdges)
        .where(whereClause)
        .orderBy(agsCodeGraphEdges.edgeId)
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.edgeId,
        sourceId: r.sourceNodeId,
        edgeTypeKey: r.edgeTypeKey as CodeGraphEdgeType,
        targetId: r.targetNodeId,
        properties: r.properties ?? undefined,
      }));
    },

    async getIngestionStats(ingestionId: string) {
      const conn = getAsDb();
      if (!conn) throw new Error("ASDB unavailable");
      // Confirm the ingestion row exists — otherwise return null so
      // the caller can distinguish "unknown ingestion" from "zero rows".
      const ingestionRows = await conn
        .select({ id: agsCodeGraphIngestions.id })
        .from(agsCodeGraphIngestions)
        .where(eq(agsCodeGraphIngestions.ingestionId, ingestionId))
        .limit(1);
      if (ingestionRows.length === 0) return null;

      // typeKey + edgeTypeKey breakdowns via GROUP BY. Two
      // independent aggregate queries (no join), one per side. Counts
      // come back as bigint-ish; coerce to number for the wire shape.
      const nodeCounts = await conn
        .select({
          typeKey: agsCodeGraphNodes.typeKey,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsCodeGraphNodes)
        .where(eq(agsCodeGraphNodes.ingestionId, ingestionId))
        .groupBy(agsCodeGraphNodes.typeKey);
      const edgeCounts = await conn
        .select({
          edgeTypeKey: agsCodeGraphEdges.edgeTypeKey,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(agsCodeGraphEdges)
        .where(eq(agsCodeGraphEdges.ingestionId, ingestionId))
        .groupBy(agsCodeGraphEdges.edgeTypeKey);

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
 * Batch size for parameterized INSERT. Each row contributes ~7
 * parameters; 500 rows = ~3500 params, well under Postgres's
 * 65535-parameter cap. Mirrors the T-E.5 carry-forward
 * `PROJECTION_BATCH_SIZE` shape but kept independent here because
 * Postgres's parameter limit (not Neo4j's MERGE cost) is the
 * binding constraint for this layer.
 */
const PERSIST_BATCH_SIZE = 500;

/**
 * Resolve a node's typeKey from the same batch. The edge-validator
 * needs both endpoints' typeKeys (closed-taxonomy edge constraint
 * registry is keyed by source + target type). When the target is
 * an unresolved cross-file reference (raw callee name / import
 * specifier), this returns null and the validator rejects with
 * `unknown_target_type`.
 */
function lookupNodeTypeKey(
  nodes: ReadonlyArray<ParsedCodeNode>,
  nodeId: string,
): string | null {
  for (const n of nodes) {
    if (n.id === nodeId) return n.typeKey;
  }
  return null;
}
