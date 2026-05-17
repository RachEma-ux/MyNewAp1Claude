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
  type SecurityGraphIngestionListRow,
  type SecurityGraphIngestionStats,
} from "./persistence/public-api.js";

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

// ============================================================================
// Defaults
// ============================================================================

export const SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT = 50;
export const SECURITY_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT = 200;

// ============================================================================
// Output envelopes
// ============================================================================

export interface SecurityGraphListIngestionsEnvelope {
  readonly ingestions: ReadonlyArray<SecurityGraphIngestionListRow>;
}

export type SecurityGraphGetIngestionStatsEnvelope =
  | { readonly status: "ok"; readonly stats: SecurityGraphIngestionStats }
  | { readonly status: "not_found"; readonly ingestionId: string };

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
});

export type SecurityGraphRouter = typeof securityGraphRouter;
