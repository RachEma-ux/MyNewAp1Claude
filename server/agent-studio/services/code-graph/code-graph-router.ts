/**
 * Code Graph — tRPC router (T-G.2.α).
 *
 * First operator-facing surface for the code-graph stack that was
 * shipped piecewise across the T-E spike (parser + projection) and
 * T-G.2.1/.3/.4/.5 (contracts + persistence + projection + lens).
 * Prior to this PR there was no tRPC surface, so the operator
 * dashboard had no way to list ingestions or inspect typeKey
 * breakdowns without going through the lens (which is layered above
 * the persistence — useful for graph view, not for raw triage).
 *
 * Mounted at `agentStudio.codeGraph.*`. Two procedures (read-only):
 *
 *   - `listIngestions` — recent ingestion rows, newest-first, capped
 *     at a configurable limit. Drives the operator dashboard's
 *     "code graph ingestion runs" panel.
 *   - `getIngestionStats` — typeKey + edgeTypeKey breakdown for one
 *     ingestion. Drives the per-ingestion drill-in.
 *
 * Permission model:
 *   - Both procedures are `adminProcedure` (operator-only). Code
 *     graph ingestions are workspace-members scope per the
 *     install-default-lenses metadata; the router is the dashboard
 *     entry point, where admin-only is the current floor. Read-side
 *     procedures can be relaxed to `protectedProcedure` later if
 *     workspace members need direct access without going through the
 *     lens.
 *
 * Mutations are intentionally absent from this slice:
 *   - Ingestion is triggered by the orchestrator (T-G.2.3 server-side
 *     or future operator-trigger mutation in a separate slice).
 *   - Projection is triggered by `code-graph-projection.ts` (T-G.2.4)
 *     downstream of persistence.
 *   - This router does not own those entry points — separation keeps
 *     the read surface stable while ingestion/projection wiring
 *     iterates.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - The store factory `createCodeGraphStore` is the only persistence
 *     seam — Drizzle / ASDB I/O does not leak into this router file.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  createCodeGraphStore,
  type CodeGraphIngestionListRow,
  type CodeGraphIngestionStats,
  type CodeGraphRepositorySummaryRow,
  type CodeGraphRecentParserErrorRow,
} from "./persistence/public-api.js";
import {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_EDGE_TYPES,
  CODE_GRAPH_EDGE_CONSTRAINTS,
  type CodeGraphEdgeType,
  type CodeGraphNodeType,
  type CodeGraphEdgeConstraint,
} from "./contracts/public-api.js";
import type {
  ParsedCodeEdge,
  ParsedCodeNode,
} from "./parser/code-graph-parser.js";

// ============================================================================
// Input schemas
// ============================================================================

const ListIngestionsInput = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

const GetIngestionStatsInput = z.object({
  ingestionId: z.string().min(1).max(255),
});

const ListIngestionNodesInput = z.object({
  ingestionId: z.string().min(1).max(255),
  typeKey: z.string().min(1).max(50).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const ListIngestionEdgesInput = z.object({
  ingestionId: z.string().min(1).max(255),
  edgeTypeKey: z.string().min(1).max(50).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const ListRepositoriesInput = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

const ListRecentParserErrorsInput = z
  .object({
    /** Cap on ingestions scanned. */
    ingestionLimit: z.number().int().positive().max(200).optional(),
    /** Cap on total parser-error rows returned. */
    errorLimit: z.number().int().positive().max(500).optional(),
  })
  .optional();

// ============================================================================
// Defaults
// ============================================================================

export const CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT = 50;
export const CODE_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT = 200;
export const CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT = 100;
export const CODE_GRAPH_DRILL_IN_ABSOLUTE_LIMIT = 500;
export const CODE_GRAPH_LIST_REPOSITORIES_DEFAULT_LIMIT = 50;
export const CODE_GRAPH_LIST_REPOSITORIES_ABSOLUTE_LIMIT = 200;
export const CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_INGESTION_LIMIT = 20;
export const CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_ERROR_LIMIT = 100;
export const CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_INGESTION_LIMIT = 200;
export const CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_ERROR_LIMIT = 500;

// ============================================================================
// Output envelopes
// ============================================================================

export interface CodeGraphListIngestionsEnvelope {
  readonly ingestions: ReadonlyArray<CodeGraphIngestionListRow>;
}

export interface CodeGraphListRepositoriesEnvelope {
  readonly repositories: ReadonlyArray<CodeGraphRepositorySummaryRow>;
}

export interface CodeGraphRecentParserErrorsEnvelope {
  readonly errors: ReadonlyArray<CodeGraphRecentParserErrorRow>;
}

/**
 * Closed-taxonomy enumeration shipped to the client so the
 * dashboard filter dropdowns don't have to hard-code the 12+10
 * enums. Edge constraints are surfaced so the dashboard can
 * preview the allowed source/target typeKey pairs for each edge —
 * a UX assist when operators filter edges.
 */
export interface CodeGraphKnownTypesEnvelope {
  readonly nodeTypes: ReadonlyArray<CodeGraphNodeType>;
  readonly edgeTypes: ReadonlyArray<CodeGraphEdgeType>;
  readonly edgeConstraints: Readonly<Record<CodeGraphEdgeType, CodeGraphEdgeConstraint>>;
}

export type CodeGraphGetIngestionStatsEnvelope =
  | { readonly status: "ok"; readonly stats: CodeGraphIngestionStats }
  | { readonly status: "not_found"; readonly ingestionId: string };

/**
 * Discriminated envelope for the node/edge drill-in procedures.
 * Stats lookup runs first as a cheap existence-check — if the
 * ingestion row is missing, return `ingestion_not_found` before
 * paying for the sample query. Saves operators from
 * misinterpreting "empty list" as "this ingestion exists but has
 * no rows".
 */
export type CodeGraphListIngestionNodesEnvelope =
  | { readonly status: "ok"; readonly nodes: ReadonlyArray<ParsedCodeNode> }
  | { readonly status: "ingestion_not_found"; readonly ingestionId: string };

export type CodeGraphListIngestionEdgesEnvelope =
  | { readonly status: "ok"; readonly edges: ReadonlyArray<ParsedCodeEdge> }
  | { readonly status: "ingestion_not_found"; readonly ingestionId: string };

// ============================================================================
// Router
// ============================================================================

export const codeGraphRouter = router({
  /**
   * List recent ingestions newest-first. Each row carries the
   * counts already accumulated during persistence — operators can
   * spot stale/failed runs at a glance.
   */
  listIngestions: adminProcedure
    .input(ListIngestionsInput)
    .query(async ({ input }): Promise<CodeGraphListIngestionsEnvelope> => {
      const limit =
        input?.limit ?? CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT;
      try {
        const store = createCodeGraphStore();
        const ingestions = await store.listIngestions(limit);
        return { ingestions };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "listIngestions failed",
        });
      }
    }),

  /**
   * Recent parser errors unioned across the most-recent ingestions.
   * Each ingestion persists at most 50 parser-error rows on its
   * `metadata.parserErrors` audit list; this procedure flattens
   * those out across the N most-recent ingestions that have
   * `parserErrorCount > 0` and applies a total-row cap.
   *
   * Newest-first by `ingestionStartedAt`, then by `filePath`
   * within an ingestion for deterministic order.
   */
  listRecentParserErrors: adminProcedure
    .input(ListRecentParserErrorsInput)
    .query(
      async ({ input }): Promise<CodeGraphRecentParserErrorsEnvelope> => {
        const ingestionLimit =
          input?.ingestionLimit ??
          CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_INGESTION_LIMIT;
        const errorLimit =
          input?.errorLimit ??
          CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_ERROR_LIMIT;
        try {
          const store = createCodeGraphStore();
          const errors = await store.listRecentParserErrors({
            ingestionLimit,
            errorLimit,
          });
          return { errors };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "listRecentParserErrors failed",
          });
        }
      },
    ),

  /**
   * Per-repository summary: most-recent ingestion + freshness anchor
   * + total ingestion count for each repositoryId. Newest-first by
   * `latestStartedAt` so stale repos sink to the bottom of the
   * dashboard panel — the operator-actionable signal for re-ingest
   * cron decisions.
   */
  listRepositories: adminProcedure
    .input(ListRepositoriesInput)
    .query(
      async ({ input }): Promise<CodeGraphListRepositoriesEnvelope> => {
        const limit =
          input?.limit ?? CODE_GRAPH_LIST_REPOSITORIES_DEFAULT_LIMIT;
        try {
          const store = createCodeGraphStore();
          const repositories = await store.listRepositories(limit);
          return { repositories };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error ? err.message : "listRepositories failed",
          });
        }
      },
    ),

  /**
   * Per-ingestion typeKey breakdown. Returns a discriminated envelope
   * (`ok` / `not_found`) so the dashboard can render an empty-state
   * panel for an operator-pasted ingestionId that doesn't exist.
   */
  getIngestionStats: adminProcedure
    .input(GetIngestionStatsInput)
    .query(
      async ({ input }): Promise<CodeGraphGetIngestionStatsEnvelope> => {
        try {
          const store = createCodeGraphStore();
          const stats = await store.getIngestionStats(input.ingestionId);
          if (stats === null) {
            return { status: "not_found", ingestionId: input.ingestionId };
          }
          return { status: "ok", stats };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error ? err.message : "getIngestionStats failed",
          });
        }
      },
    ),

  /**
   * Closed-taxonomy enumeration. No DB I/O — just exposes the
   * compile-time constants from
   * `code-intelligence-contracts.ts`. The client uses this to
   * populate the dashboard's typeKey + edgeTypeKey filter dropdowns
   * (instead of hard-coding the 12+10 enums in client code) and to
   * preview the allowed source/target typeKey pairs for each edge.
   *
   * No `input` schema — it's an enumeration request, parameterless
   * by design.
   */
  listKnownTypes: adminProcedure.query(
    (): CodeGraphKnownTypesEnvelope => ({
      nodeTypes: CODE_GRAPH_NODE_TYPES,
      edgeTypes: CODE_GRAPH_EDGE_TYPES,
      edgeConstraints: CODE_GRAPH_EDGE_CONSTRAINTS,
    }),
  ),

  /**
   * Per-ingestion node drill-in. Returns sample rows ordered by
   * `nodeId` (stable parser-emitted id), optionally filtered by
   * `typeKey`. Existence-checks the ingestion first via
   * `getIngestionStats === null` so an unknown ingestionId gets the
   * `ingestion_not_found` envelope instead of an ambiguous empty
   * list.
   */
  listIngestionNodes: adminProcedure
    .input(ListIngestionNodesInput)
    .query(
      async ({ input }): Promise<CodeGraphListIngestionNodesEnvelope> => {
        const limit = input.limit ?? CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT;
        try {
          const store = createCodeGraphStore();
          const stats = await store.getIngestionStats(input.ingestionId);
          if (stats === null) {
            return {
              status: "ingestion_not_found",
              ingestionId: input.ingestionId,
            };
          }
          const nodes = await store.listIngestionNodes({
            ingestionId: input.ingestionId,
            typeKey: input.typeKey,
            limit,
          });
          return { status: "ok", nodes };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error ? err.message : "listIngestionNodes failed",
          });
        }
      },
    ),

  /**
   * Per-ingestion edge drill-in. Mirror of `listIngestionNodes`
   * with `edgeTypeKey` filter. Same ingestion-existence
   * pre-check + discriminated envelope.
   */
  listIngestionEdges: adminProcedure
    .input(ListIngestionEdgesInput)
    .query(
      async ({ input }): Promise<CodeGraphListIngestionEdgesEnvelope> => {
        const limit = input.limit ?? CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT;
        try {
          const store = createCodeGraphStore();
          const stats = await store.getIngestionStats(input.ingestionId);
          if (stats === null) {
            return {
              status: "ingestion_not_found",
              ingestionId: input.ingestionId,
            };
          }
          const edges = await store.listIngestionEdges({
            ingestionId: input.ingestionId,
            edgeTypeKey: input.edgeTypeKey,
            limit,
          });
          return { status: "ok", edges };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error ? err.message : "listIngestionEdges failed",
          });
        }
      },
    ),

  /**
   * T-G.2.3 orchestrator trigger (2026-05-23). Walks the repo on
   * disk, runs the tree-sitter parser per `.ts`/`.tsx` file, and
   * persists nodes/edges/errors into the `ags_code_graph_*` tables.
   *
   * Designed to be called once per Code Studio repo registration
   * (the user-visible Code Review Co-pilot use case) plus on
   * operator-demand re-ingest. `ingestionId` is optional — when
   * omitted, a fresh UUID is minted; when supplied, the persistence
   * layer's composite-unique indexes (`(ingestion_id, node_id)` /
   * `(ingestion_id, edge_id)`) overwrite in place.
   *
   * Slow on large repos — the orchestrator caps at `maxFiles`
   * (default 200) to keep first-run interactive. Operators wanting
   * a full sweep pass `maxFiles: 100000` explicitly.
   */
  triggerIngest: adminProcedure
    .input(
      z.object({
        repoPath: z.string().min(1),
        repositoryId: z.string().min(1),
        relativeSubPath: z.string().optional(),
        maxFiles: z.number().int().positive().optional(),
        maxFileBytes: z.number().int().positive().optional(),
        ingestionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { ingestRepository } = await import(
          "./orchestrator/public-api.js"
        );
        return await ingestRepository(input);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "code-graph orchestrator failed",
        });
      }
    }),
});

export type CodeGraphRouter = typeof codeGraphRouter;
