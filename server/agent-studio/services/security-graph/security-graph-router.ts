/**
 * Security Graph — tRPC router (T-G.3.α).
 *
 * First operator-facing surface for the security-graph stack that was
 * shipped piecewise across T-G.3.1 (contracts) + T-G.3.3 (persistence)
 * + T-G.3.4 (projection) + the NVD CVE feed reader. Prior to this PR
 * there was no tRPC surface, so the operator dashboard had no way to
 * list CVE/finding ingestions or inspect typeKey breakdowns without
 * going through the lens.
 *
 * Mirrors `code-graph-router.ts` line-for-line — precedent (s)
 * carry-forward of the T-G.2.α-ε read-surface ladder. The shape
 * stays uniform across both graphs so the dashboard composition is
 * uniform.
 *
 * Mounted at `agentStudio.securityGraph.*`. Two procedures (read-only):
 *
 *   - `listIngestions` — recent ingestion rows from
 *     `ags_security_graph_ingestions`, newest-first, capped at a
 *     configurable limit. Drives the operator dashboard's
 *     "security graph ingestion runs" panel.
 *   - `getIngestionStats` — typeKey + edgeTypeKey breakdown for one
 *     ingestion. Drives the per-ingestion drill-in.
 *
 * Permission model:
 *   - Both procedures are `adminProcedure` (operator-only).
 *   - **Per remaining-execution-plan T-G.3**: "security findings are
 *     not workspace-public". `adminProcedure` is the floor; downstream
 *     workspace-scoping (if added later) goes on top, never below.
 *
 * Mutations are intentionally absent:
 *   - NVD CVE feed ingestion is triggered by the orchestrator
 *     (or future cron) — not by this router.
 *   - Projection is triggered by `security-graph-projection.ts`
 *     downstream of persistence.
 *   - This router does not own those entry points.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - The store factory `createSecurityGraphStore` is the only
 *     persistence seam.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  createSecurityGraphStore,
  type SecurityGraphEdge,
  type SecurityGraphIngestionListRow,
  type SecurityGraphIngestionStats,
  type SecurityGraphNode,
  type SecurityGraphSourceSummaryRow,
} from "./persistence/public-api.js";
import {
  SECURITY_GRAPH_NODE_TYPES,
  SECURITY_GRAPH_EDGE_TYPES,
  SECURITY_GRAPH_EDGE_CONSTRAINTS,
  type SecurityGraphEdgeConstraint,
  type SecurityGraphEdgeType,
  type SecurityGraphNodeType,
} from "./contracts.js";

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

const ListSourcesInput = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

// ============================================================================
// Defaults
// ============================================================================

export const SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT = 50;
export const SECURITY_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT = 200;
export const SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT = 100;
export const SECURITY_GRAPH_DRILL_IN_ABSOLUTE_LIMIT = 500;
export const SECURITY_GRAPH_LIST_SOURCES_DEFAULT_LIMIT = 50;
export const SECURITY_GRAPH_LIST_SOURCES_ABSOLUTE_LIMIT = 200;

// ============================================================================
// Output envelopes
// ============================================================================

export interface SecurityGraphListIngestionsEnvelope {
  readonly ingestions: ReadonlyArray<SecurityGraphIngestionListRow>;
}

export type SecurityGraphGetIngestionStatsEnvelope =
  | { readonly status: "ok"; readonly stats: SecurityGraphIngestionStats }
  | { readonly status: "not_found"; readonly ingestionId: string };

export type SecurityGraphListIngestionNodesEnvelope =
  | { readonly status: "ok"; readonly nodes: ReadonlyArray<SecurityGraphNode> }
  | { readonly status: "ingestion_not_found"; readonly ingestionId: string };

export type SecurityGraphListIngestionEdgesEnvelope =
  | { readonly status: "ok"; readonly edges: ReadonlyArray<SecurityGraphEdge> }
  | { readonly status: "ingestion_not_found"; readonly ingestionId: string };

export interface SecurityGraphListSourcesEnvelope {
  readonly sources: ReadonlyArray<SecurityGraphSourceSummaryRow>;
}

/**
 * Closed-taxonomy enumeration shipped to the client so the
 * dashboard filter dropdowns don't have to hard-code the 10+8
 * enums. Edge constraints are surfaced so the dashboard can
 * preview the allowed source/target typeKey pairs for each edge.
 * Mirrors `CodeGraphKnownTypesEnvelope`.
 */
export interface SecurityGraphKnownTypesEnvelope {
  readonly nodeTypes: ReadonlyArray<SecurityGraphNodeType>;
  readonly edgeTypes: ReadonlyArray<SecurityGraphEdgeType>;
  readonly edgeConstraints: Readonly<
    Record<SecurityGraphEdgeType, SecurityGraphEdgeConstraint>
  >;
}

// ============================================================================
// Router
// ============================================================================

export const securityGraphRouter = router({
  /**
   * List recent ingestions newest-first. Each row carries the counts
   * already accumulated during persistence — operators spot
   * stale/failed runs at a glance.
   */
  listIngestions: adminProcedure
    .input(ListIngestionsInput)
    .query(async ({ input }): Promise<SecurityGraphListIngestionsEnvelope> => {
      const limit =
        input?.limit ?? SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT;
      try {
        const store = createSecurityGraphStore();
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
   * Per-ingestion typeKey breakdown. Returns a discriminated envelope
   * (`ok` / `not_found`) so the dashboard can render an empty-state
   * panel for an operator-pasted ingestionId that doesn't exist.
   */
  getIngestionStats: adminProcedure
    .input(GetIngestionStatsInput)
    .query(
      async ({ input }): Promise<SecurityGraphGetIngestionStatsEnvelope> => {
        try {
          const store = createSecurityGraphStore();
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
   * Per-source-key summary keyed on the most-recent ingestion.
   * Newest-first by `latestStartedAt` so stale feeds sink to the
   * bottom of the dashboard panel — the operator-actionable signal
   * for re-ingest cron decisions. Mirrors
   * `codeGraph.listRepositories`.
   */
  listSources: adminProcedure
    .input(ListSourcesInput)
    .query(
      async ({ input }): Promise<SecurityGraphListSourcesEnvelope> => {
        const limit =
          input?.limit ?? SECURITY_GRAPH_LIST_SOURCES_DEFAULT_LIMIT;
        try {
          const store = createSecurityGraphStore();
          const sources = await store.listSources(limit);
          return { sources };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error ? err.message : "listSources failed",
          });
        }
      },
    ),

  /**
   * Closed-taxonomy enumeration. No DB I/O — just exposes the
   * compile-time constants from `contracts.ts`. Parameterless by
   * design; mirrors `codeGraph.listKnownTypes`.
   */
  listKnownTypes: adminProcedure.query(
    (): SecurityGraphKnownTypesEnvelope => ({
      nodeTypes: SECURITY_GRAPH_NODE_TYPES,
      edgeTypes: SECURITY_GRAPH_EDGE_TYPES,
      edgeConstraints: SECURITY_GRAPH_EDGE_CONSTRAINTS,
    }),
  ),

  listIngestionNodes: adminProcedure
    .input(ListIngestionNodesInput)
    .query(
      async ({ input }): Promise<SecurityGraphListIngestionNodesEnvelope> => {
        const limit = input.limit ?? SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT;
        try {
          const store = createSecurityGraphStore();
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

  listIngestionEdges: adminProcedure
    .input(ListIngestionEdgesInput)
    .query(
      async ({ input }): Promise<SecurityGraphListIngestionEdgesEnvelope> => {
        const limit = input.limit ?? SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT;
        try {
          const store = createSecurityGraphStore();
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
});

export type SecurityGraphRouter = typeof securityGraphRouter;
