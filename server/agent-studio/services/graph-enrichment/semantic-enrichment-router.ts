/**
 * Semantic Enrichment — tRPC router (T-D.3.α + T-D.3.β).
 *
 * Operator-facing read surface for the Semantic Enrichment Agent.
 * Contracts (T-D.3 closed taxonomy) + agent runtime (T-D.3.5 wire-up)
 * + store + evidence-collector + proposer are all shipped; this
 * router exposes:
 *
 *   - `listKnownProposalKinds` (T-D.3.α) — closed-taxonomy
 *     enumeration of the 5 SemanticEnrichmentProposalKind values
 *     plus per-kind metadata. Same parameterless-enumeration
 *     pattern as `codeGraph.listKnownTypes` /
 *     `securityGraph.listKnownTypes` /
 *     `recommendation.listKnownKinds` /
 *     `impactAnalysis.listKnownKinds`.
 *   - `listRecentRuns` (T-D.3.β) — newest-first list of recent
 *     enrichment runs from `ags_semantic_enrichment_runs`. Drives
 *     the "Recent enrichment runs" panel.
 *   - `getRunStats` (T-D.3.β) — per-run proposal counts grouped
 *     by `proposalKind` + `status`. Drives the per-run drill-in.
 *   - `listProposals` (T-D.3.β) — paged proposals for one run,
 *     optionally filtered by status (e.g.
 *     `rejected_below_threshold` for audit views).
 *
 * **Deferred — run-trigger mutation.**
 * Manually triggering an enrichment run is a mutation that needs
 * the candidate-selection layer plumbed (T-D.3 §candidates).
 * `listCandidatesByKind` (T-D.3.δ-prep) ships that layer for the
 * `description_enrichment` kind; the trigger mutation itself stays
 * deferred until model-access binding + the remaining 4 selectors
 * land.
 *
 * Mounted at `agentStudio.semanticEnrichment.*`. All procedures are
 * `adminProcedure` and read-only.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O only via the existing `createSemanticEnrichmentStore`
 *     factory (T-D.3.2) — no Drizzle imports in this file.
 *   - `adminProcedure` floor preserved.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
  SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
  type SemanticEnrichmentProposalKind,
  type SemanticEnrichmentProposalKindMetadata,
} from "./contracts.js";
import {
  createSemanticEnrichmentStore,
  listSemanticEnrichmentCandidates,
  SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT,
  SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT,
  type SemanticEnrichmentCandidatesEnvelope,
  type SemanticEnrichmentProposalDetail,
  type SemanticEnrichmentProposalListRow,
  type SemanticEnrichmentRecentRejectionRow,
  type SemanticEnrichmentRunListRow,
  type SemanticEnrichmentRunStats,
} from "./public-api.js";

// ============================================================================
// Limit constants
// ============================================================================

export const SEMANTIC_ENRICHMENT_LIST_RUNS_DEFAULT_LIMIT = 50;
export const SEMANTIC_ENRICHMENT_LIST_RUNS_ABSOLUTE_LIMIT = 200;
export const SEMANTIC_ENRICHMENT_LIST_PROPOSALS_DEFAULT_LIMIT = 100;
export const SEMANTIC_ENRICHMENT_LIST_PROPOSALS_ABSOLUTE_LIMIT = 500;

export const SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_RUN_LIMIT = 20;
export const SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_RUN_LIMIT = 200;
export const SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT = 100;
export const SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT = 500;

// ============================================================================
// Output envelopes
// ============================================================================

export interface ListSemanticEnrichmentProposalKindsEnvelope {
  readonly kinds: ReadonlyArray<SemanticEnrichmentProposalKind>;
  readonly metadata: Readonly<
    Record<
      SemanticEnrichmentProposalKind,
      SemanticEnrichmentProposalKindMetadata
    >
  >;
}

export interface ListSemanticEnrichmentRecentRunsEnvelope {
  readonly runs: ReadonlyArray<SemanticEnrichmentRunListRow>;
}

export interface GetSemanticEnrichmentRunStatsEnvelope {
  readonly status: "ok" | "not_found";
  readonly stats?: SemanticEnrichmentRunStats;
}

export interface ListSemanticEnrichmentProposalsEnvelope {
  readonly proposals: ReadonlyArray<SemanticEnrichmentProposalListRow>;
}

export interface ListSemanticEnrichmentRecentRejectionsEnvelope {
  readonly rejections: ReadonlyArray<SemanticEnrichmentRecentRejectionRow>;
}

/**
 * `getProposalDetail` envelope (T-D.3.ε). Discriminated for
 * stale-link safety — operators may click a link to a pruned /
 * retention-deleted proposal.
 */
export interface GetSemanticEnrichmentProposalDetailEnvelope {
  readonly status: "ok" | "not_found";
  readonly proposalId: number;
  readonly proposal?: SemanticEnrichmentProposalDetail;
}

// ============================================================================
// Router
// ============================================================================

export const semanticEnrichmentRouter = router({
  /**
   * Closed-taxonomy enumeration. Parameterless. Mirrors
   * `codeGraph.listKnownTypes` / `securityGraph.listKnownTypes` /
   * `recommendation.listKnownKinds` /
   * `impactAnalysis.listKnownKinds`.
   *
   * Drives the operator dashboard's "Enrichment proposal kinds"
   * picker — the 5 closed-taxonomy values + per-kind label +
   * description + `requiresSourceCitation` flag (all 5 require
   * citations, but the field is part of the contract so future
   * cite-less kinds can be added without a flag-day cutover).
   */
  listKnownProposalKinds: adminProcedure.query(
    (): ListSemanticEnrichmentProposalKindsEnvelope => ({
      kinds: SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
      metadata: SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
    }),
  ),

  /**
   * Recent enrichment runs, newest-first by `createdAt`. Drives the
   * operator dashboard's "Recent enrichment runs" panel. Mirrors
   * `codeGraph.listIngestions` / `securityGraph.listIngestions`
   * shape.
   */
  listRecentRuns: adminProcedure
    .input(
      z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_LIST_RUNS_ABSOLUTE_LIMIT)
          .default(SEMANTIC_ENRICHMENT_LIST_RUNS_DEFAULT_LIMIT),
      }),
    )
    .query(
      async ({ input }): Promise<ListSemanticEnrichmentRecentRunsEnvelope> => {
        const store = createSemanticEnrichmentStore();
        const runs = await store.listRecentRuns(input.limit);
        return { runs };
      },
    ),

  /**
   * Per-run aggregate stats — proposal counts grouped by
   * `proposalKind` + `status`. Drives the per-run drill-in. Returns
   * `status:"not_found"` when the runId doesn't exist (vs throwing,
   * because operators may click a stale link). Mirrors
   * `codeGraph.getIngestionStats` discriminated envelope shape.
   */
  getRunStats: adminProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(
      async ({ input }): Promise<GetSemanticEnrichmentRunStatsEnvelope> => {
        const store = createSemanticEnrichmentStore();
        const stats = await store.getRunStats(input.runId);
        if (stats === null) return { status: "not_found" };
        return { status: "ok", stats };
      },
    ),

  /**
   * Paged proposals for one run, newest-first. Optional `status`
   * filter — pass `"rejected_below_threshold"` for the
   * confidence-gate audit view, `"pending"` for the operator
   * triage queue. Strips the heavy `payload` / `sourceEvidence`
   * JSON; detail surfaces (not yet built) re-read with the full
   * JSON.
   */
  listProposals: adminProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        status: z.string().min(1).max(100).optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_LIST_PROPOSALS_ABSOLUTE_LIMIT)
          .default(SEMANTIC_ENRICHMENT_LIST_PROPOSALS_DEFAULT_LIMIT),
      }),
    )
    .query(
      async ({ input }): Promise<ListSemanticEnrichmentProposalsEnvelope> => {
        const store = createSemanticEnrichmentStore();
        const proposals = await store.listProposals({
          runId: input.runId,
          ...(input.status !== undefined ? { status: input.status } : {}),
          limit: input.limit,
        });
        return { proposals };
      },
    ),

  /**
   * Cross-run rejection telemetry (T-D.3.γ). Flattens below-
   * threshold rejections across the most-recent `runLimit` runs,
   * grouped by `(runId, proposalKind)`. Drives the operator panel
   * "which kinds are most-often failing the confidence gate" —
   * actionable signal for confidence-threshold tuning or
   * per-kind proposer improvement.
   *
   * Mirrors `securityGraph.listRecentRejectionsByReason`
   * (T-G.3.ε) — same windowing shape, source-of-record context
   * attached at read-time (here: `runId` + `runStartedAt`; there:
   * `ingestionId` + `sourceKey`).
   */
  /**
   * Per-proposal full detail (T-D.3.ε). Returns the heavy
   * `payload` + `sourceEvidence` JSON that the T-D.3.β list view
   * intentionally omits — operator triage needs the full rationale
   * + cite evidence to decide approve / reject. Discriminated
   * `not_found` envelope for stale-link safety (proposals can be
   * retention-pruned).
   *
   * Mirrors `securityGraph.getIngestionStats` /
   * `goldenQuestions.getRunStats` discriminated `{ status: "ok" |
   * "not_found", ... }` shape.
   */
  getProposalDetail: adminProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .query(
      async ({
        input,
      }): Promise<GetSemanticEnrichmentProposalDetailEnvelope> => {
        const store = createSemanticEnrichmentStore();
        const proposal = await store.getProposalDetail(input.proposalId);
        if (proposal === null) {
          return { status: "not_found", proposalId: input.proposalId };
        }
        return { status: "ok", proposalId: input.proposalId, proposal };
      },
    ),

  /**
   * Candidate-selection layer for the not-yet-built T-D.3.δ trigger
   * mutation. Operators (and a future cron) call this to preview
   * which graph nodes would be considered for enrichment by kind
   * before kicking off a real run.
   *
   * Today only `proposalKind === "description_enrichment"` returns
   * non-empty data — the SQL: nodes whose `description` property is
   * missing OR shorter than `weakDescriptionMaxLength` (default 40
   * chars including JSON quoting). Other kinds return an empty
   * envelope with `weakDescriptionMaxLengthUsed: null` until their
   * dedicated scanners ship in follow-up slices.
   *
   * Workspace-scoped — required input arg. `typeKey` optional filter
   * for narrowing to one node type.
   */
  listCandidatesByKind: adminProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        proposalKind: z.enum(
          SEMANTIC_ENRICHMENT_PROPOSAL_KINDS as unknown as readonly [
            SemanticEnrichmentProposalKind,
            ...SemanticEnrichmentProposalKind[],
          ],
        ),
        typeKey: z.string().min(1).max(100).optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT)
          .default(SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT),
        weakDescriptionMaxLength: z
          .number()
          .int()
          .min(1)
          .max(10_000)
          .optional(),
      }),
    )
    .query(
      async ({ input }): Promise<SemanticEnrichmentCandidatesEnvelope> => {
        return await listSemanticEnrichmentCandidates({
          workspaceId: input.workspaceId,
          proposalKind: input.proposalKind,
          limit: input.limit,
          ...(input.typeKey !== undefined ? { typeKey: input.typeKey } : {}),
          ...(input.weakDescriptionMaxLength !== undefined
            ? { weakDescriptionMaxLength: input.weakDescriptionMaxLength }
            : {}),
        });
      },
    ),

  listRecentRejectionsByKind: adminProcedure
    .input(
      z.object({
        runLimit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_RUN_LIMIT)
          .default(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_RUN_LIMIT),
        rowLimit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT)
          .default(SEMANTIC_ENRICHMENT_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT),
      }),
    )
    .query(
      async ({
        input,
      }): Promise<ListSemanticEnrichmentRecentRejectionsEnvelope> => {
        const store = createSemanticEnrichmentStore();
        const rejections = await store.listRecentRejectionsByKind({
          runLimit: input.runLimit,
          rowLimit: input.rowLimit,
        });
        return { rejections };
      },
    ),
});

export type SemanticEnrichmentRouter = typeof semanticEnrichmentRouter;
