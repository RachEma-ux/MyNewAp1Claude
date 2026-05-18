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
 *   - `triggerRun` (T-D.3.δ) — single mutation that selects
 *     candidates → runs the agent → persists proposals. Returns a
 *     discriminated `ok | no_candidates | kind_not_yet_supported`
 *     envelope. Composition lives in `semantic-enrichment-runner.ts`;
 *     this file only adapts inputs/outputs to the tRPC boundary.
 *   - `promote` (T-D.4 slice 2) — promote a pending enrichment
 *     proposal into the existing graph-correction approve-and-apply
 *     chain. Composition lives in `semantic-enrichment-promote-runner.ts`;
 *     this file only adapts inputs/outputs to the tRPC boundary and
 *     maps bridge errors to TRPCError codes.
 *   - `promoteAndApprove` (T-D.4 slice 3) — combo: promote + immediate
 *     `approveAndApplyProposal` so a single operator click takes an
 *     enrichment proposal end-to-end through approval + mutation +
 *     reprojection. Composition lives in
 *     `semantic-enrichment-promote-and-approve.ts`.
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
import { TRPCError } from "@trpc/server";

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
  runSemanticEnrichment,
  SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT,
  SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT,
  ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
  EnrichmentProposalAlreadyPromotedError,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
  type RunSemanticEnrichmentOutput,
  type SemanticEnrichmentCandidatesEnvelope,
  type SemanticEnrichmentProposalDetail,
  type SemanticEnrichmentProposalListRow,
  type SemanticEnrichmentRecentRejectionRow,
  type SemanticEnrichmentRunListRow,
  type SemanticEnrichmentRunStats,
} from "./public-api.js";
import {
  AsdbUnavailableForPromotionError,
  runPromoteSemanticEnrichment,
} from "./semantic-enrichment-promote-runner.js";
import { promoteAndApproveProposal } from "./semantic-enrichment-promote-and-approve.js";
import {
  runPromoteBulk,
  ABSOLUTE_BULK_PROMOTE_LIMIT,
  BulkPromoteEmptyInputError,
  BulkPromoteLimitExceededError,
} from "./semantic-enrichment-promote-bulk.js";

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

  /**
   * T-D.3.δ — trigger one Semantic Enrichment run.
   *
   * Operator picks a `proposalKind` + a provider/model binding;
   * server selects candidates (via the `listCandidatesByKind` selector
   * layer), composes store + evidence-collector + LLM proposer, runs
   * the agent, persists runs + proposals, returns the discriminated
   * envelope.
   *
   * Discriminated envelope (`RunSemanticEnrichmentOutput`):
   *   - `"ok"` — agent ran; full counts attached
   *   - `"no_candidates"` — selector returned zero rows
   *   - `"kind_not_yet_supported"` — proposalKind is one of the 3
   *     deferred kinds (stale_fact_refresh / entity_disambiguation /
   *     relationship_label_repair) — each needs the
   *     `SemanticEnrichmentCandidate` contract extension; the message
   *     names the constraint explicitly.
   *
   * Hard-rule compliance (CLAUDE.md):
   *   - LLM access lives behind the runner's resolved openrouter
   *     `execute` (boundary tested by the router's source-scan).
   *   - Agent emits proposals only — never mutates graph rows.
   *   - `adminProcedure` floor preserved.
   */
  triggerRun: adminProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        proposalKind: z.enum(
          SEMANTIC_ENRICHMENT_PROPOSAL_KINDS as unknown as readonly [
            SemanticEnrichmentProposalKind,
            ...SemanticEnrichmentProposalKind[],
          ],
        ),
        providerConnectionId: z.number().int().positive(),
        modelRef: z.string().min(1).max(200),
        actorId: z.number().int().positive(),
        minConfidence: z.number().min(0).max(1).optional(),
        maxProposals: z
          .number()
          .int()
          .min(1)
          .max(ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN)
          .optional(),
        typeKey: z.string().min(1).max(100).optional(),
        weakDescriptionMaxLength: z
          .number()
          .int()
          .min(1)
          .max(10_000)
          .optional(),
        candidateLimit: z
          .number()
          .int()
          .min(1)
          .max(SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT)
          .optional(),
        temperature: z.number().min(0).max(2).optional(),
        // T-D.3.δ-followup δ — operator-tunable stale-fact grace window.
        // Bounded to [0, 1 day] to prevent absurd values.
        staleFactGraceMs: z
          .number()
          .int()
          .min(0)
          .max(24 * 60 * 60 * 1000)
          .optional(),
      }),
    )
    .mutation(
      async ({ input }): Promise<RunSemanticEnrichmentOutput> => {
        return await runSemanticEnrichment({
          workspaceId: input.workspaceId,
          proposalKind: input.proposalKind,
          providerConnectionId: input.providerConnectionId,
          modelRef: input.modelRef,
          actorId: input.actorId,
          ...(input.minConfidence !== undefined
            ? { minConfidence: input.minConfidence }
            : {}),
          ...(input.maxProposals !== undefined
            ? { maxProposals: input.maxProposals }
            : {}),
          ...(input.typeKey !== undefined ? { typeKey: input.typeKey } : {}),
          ...(input.weakDescriptionMaxLength !== undefined
            ? { weakDescriptionMaxLength: input.weakDescriptionMaxLength }
            : {}),
          ...(input.candidateLimit !== undefined
            ? { candidateLimit: input.candidateLimit }
            : {}),
          ...(input.temperature !== undefined
            ? { temperature: input.temperature }
            : {}),
          ...(input.staleFactGraceMs !== undefined
            ? { staleFactGraceMs: input.staleFactGraceMs }
            : {}),
        });
      },
    ),

  /**
   * T-D.4 slice 2 — promote a pending semantic-enrichment proposal
   * into a graph-correction proposal so the existing approve-and-apply
   * chain can act on it.
   *
   * Returns the new correction-proposal id; operators continue with
   * the existing `agentStudio.graphQuality.approveAndApply` chain
   * (or its split approve/apply procedures).
   *
   * Error mapping:
   *   - source proposal not found → `NOT_FOUND`
   *   - source proposal already promoted → `CONFLICT` (idempotency)
   *   - source proposal in non-pending status → `CONFLICT`
   *   - ASDB unavailable → `INTERNAL_SERVER_ERROR`
   *   - unknown error → re-thrown (the platform wraps it)
   *
   * Hard-rule compliance (CLAUDE.md):
   *   - Graph mutation never happens here — only proposal-row +
   *     audit-row writes. The applier chain downstream handles SoT
   *     mutation + reprojection.
   *   - `adminProcedure` floor preserved.
   */
  /**
   * T-D.4 slice 3 — promote + approve + apply in ONE operator call.
   *
   * Operator-convenience combo. Runs `promote` to bridge into the
   * graph-correction surface, then immediately runs
   * `approveAndApplyProposal` on the new correction proposal.
   *
   * Returns both halves' results so operators see what got promoted
   * + what got applied + the new audit-event row id from the
   * mutation-worker.
   *
   * Error mapping mirrors `promote`'s — bridge errors map to
   * TRPCError codes; downstream approve/apply errors re-thrown
   * verbatim (operators see the same error they'd see calling
   * `approveAndApplyProposal` directly).
   */
  promoteAndApprove: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        decidedByUserId: z.number().int().positive(),
        rationale: z.string().min(1).max(2000).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
        notifyUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await promoteAndApproveProposal({
          proposalId: input.proposalId,
          decidedByUserId: input.decidedByUserId,
          ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
          ...(input.proposedByAgentId !== undefined
            ? { proposedByAgentId: input.proposedByAgentId }
            : {}),
          ...(input.notifyUserId !== undefined
            ? { notifyUserId: input.notifyUserId }
            : {}),
        });
        return {
          status: "ok" as const,
          enrichmentProposalId: result.promote.enrichmentProposalId,
          correctionProposalId: result.promote.correctionProposalId,
          applied: result.approveAndApply.apply.result.applied,
          ...(result.approveAndApply.apply.result.reason !== undefined
            ? { applyReason: result.approveAndApply.apply.result.reason }
            : {}),
        };
      } catch (e) {
        if (e instanceof EnrichmentProposalNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        if (e instanceof EnrichmentProposalAlreadyPromotedError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        if (e instanceof EnrichmentProposalNotPromotableError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        if (e instanceof AsdbUnavailableForPromotionError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: e.message,
          });
        }
        throw e;
      }
    }),

  promote: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        decidedByUserId: z.number().int().positive().optional(),
        decisionRationale: z.string().min(1).max(2000).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await runPromoteSemanticEnrichment({
          proposalId: input.proposalId,
          ...(input.decidedByUserId !== undefined
            ? { decidedByUserId: input.decidedByUserId }
            : {}),
          ...(input.decisionRationale !== undefined
            ? { decisionRationale: input.decisionRationale }
            : {}),
          ...(input.proposedByAgentId !== undefined
            ? { proposedByAgentId: input.proposedByAgentId }
            : {}),
        });
        return {
          status: "ok" as const,
          correctionProposalId: result.correctionProposalId,
          enrichmentProposalId: result.enrichmentProposalId,
        };
      } catch (e) {
        if (e instanceof EnrichmentProposalNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        if (e instanceof EnrichmentProposalAlreadyPromotedError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        if (e instanceof EnrichmentProposalNotPromotableError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        if (e instanceof AsdbUnavailableForPromotionError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: e.message,
          });
        }
        throw e;
      }
    }),

  /**
   * T-D.4 carry-forward — bulk-promote endpoint.
   *
   * Wraps `promote` over an array of proposal ids and aggregates per-
   * row outcomes (same bucketing as the auto-promote cron). Useful
   * for operator-triggered batch promotions that don't want to wait
   * on the cron's */15 cadence.
   *
   * Input validation:
   *   - 1 ≤ `proposalIds.length` ≤ ABSOLUTE_BULK_PROMOTE_LIMIT (500)
   *   - Each id positive integer
   *
   * Bridge errors are bucketed per-row inside `runPromoteBulk`; the
   * router itself only translates the two input-validation errors
   * into BAD_REQUEST TRPCError.
   *
   * Hard-rule compliance:
   *   - `adminProcedure` floor preserved.
   *   - Mutation goes through the existing single-promote runner;
   *     no new DB write paths.
   */
  promoteBulk: adminProcedure
    .input(
      z.object({
        proposalIds: z.array(z.number().int().positive()).min(1),
        decidedByUserId: z.number().int().positive().optional(),
        decisionRationale: z.string().min(1).max(2000).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await runPromoteBulk({
          proposalIds: input.proposalIds,
          ...(input.decidedByUserId !== undefined
            ? { decidedByUserId: input.decidedByUserId }
            : {}),
          ...(input.decisionRationale !== undefined
            ? { decisionRationale: input.decisionRationale }
            : {}),
          ...(input.proposedByAgentId !== undefined
            ? { proposedByAgentId: input.proposedByAgentId }
            : {}),
        });
      } catch (e) {
        if (e instanceof BulkPromoteEmptyInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        if (e instanceof BulkPromoteLimitExceededError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `bulk promote rejected — per-call cap is ${ABSOLUTE_BULK_PROMOTE_LIMIT}`,
          });
        }
        throw e;
      }
    }),
});

export type SemanticEnrichmentRouter = typeof semanticEnrichmentRouter;
