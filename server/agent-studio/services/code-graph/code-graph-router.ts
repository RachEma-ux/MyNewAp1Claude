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

export const CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT = 50;
export const CODE_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT = 200;

// ============================================================================
// Output envelopes
// ============================================================================

export interface CodeGraphListIngestionsEnvelope {
  readonly ingestions: ReadonlyArray<CodeGraphIngestionListRow>;
}

export type CodeGraphGetIngestionStatsEnvelope =
  | { readonly status: "ok"; readonly stats: CodeGraphIngestionStats }
  | { readonly status: "not_found"; readonly ingestionId: string };

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
});

export type CodeGraphRouter = typeof codeGraphRouter;
