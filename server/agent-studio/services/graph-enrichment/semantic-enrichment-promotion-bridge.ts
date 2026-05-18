/**
 * Semantic Enrichment → Graph Correction promotion bridge — T-D.4 slice 1.
 *
 * The Semantic Enrichment Agent writes proposals to its own table
 * (`ags_semantic_enrichment_proposals`) — agent-scoped, with run
 * lifecycle, source evidence, and per-proposal confidence. The
 * existing approve-and-apply chain (`graph-quality/approve-and-apply.ts`
 * + `mutation-worker.ts`) operates on a different table —
 * `ags_graph_correction_proposals` — the generic graph-correction
 * surface every applier expects.
 *
 * This bridge **promotes** a pending semantic-enrichment proposal into
 * a graph-correction proposal so it can flow through the existing
 * chain. The pattern mirrors `failure-correction-bridge.ts` (T-D.5)
 * which bridges golden-question failures into the same surface.
 *
 * What this slice ships:
 *   - Pure conversion: `convertSemanticEnrichmentToCorrectionProposal`
 *     (no I/O) maps an enrichment-proposal detail row to the row
 *     shape ready to insert into `ags_graph_correction_proposals`.
 *   - Promotion writer: `promoteSemanticEnrichmentProposal` reads the
 *     enrichment proposal, validates state (must be `pending`), runs
 *     the conversion, inserts the correction proposal, flips the
 *     enrichment proposal's status to `promoted`, writes a
 *     `promoted` row to `ags_semantic_enrichment_decisions` for audit.
 *   - DI seams: the underlying I/O (read, insert correction proposal,
 *     update source status, write decision) are factored through
 *     injectable functions so tests + future call sites compose
 *     freely without mocking Drizzle directly.
 *
 * What this slice does NOT ship (future T-D.4 slices):
 *   - tRPC mutation surface to trigger promotion
 *   - Combo: `promoteAndApprove` (promote then immediately call
 *     `approveAndApplyProposal` to short-circuit operator UI clicks)
 *   - Bulk-promote endpoints
 *   - UI affordances
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Read-only against `ags_semantic_enrichment_*`; write to
 *     `ags_graph_correction_proposals` + `ags_semantic_enrichment_decisions`.
 *     Graph mutation NEVER happens here — that's the downstream
 *     `applyApprovedProposal` chain.
 *   - No neo4j-driver / openrouter / dispatchMcpToolCall imports.
 *   - State guard: only `pending` enrichment proposals are promotable.
 *     `rejected_below_threshold` (the audit sentinel) and already-
 *     promoted proposals throw tagged errors.
 *   - Idempotency: a second promotion of the same proposal throws
 *     `EnrichmentProposalAlreadyPromotedError`; callers can catch it
 *     to no-op a retry.
 */

import type { SemanticEnrichmentProposalDetail } from "./semantic-enrichment-store.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Status sentinel written to `ags_semantic_enrichment_proposals.status`
 * when the proposal has been bridged into a correction proposal. The
 * downstream approve/reject lifecycle then plays out on the
 * correction-proposal row, not on this enrichment row.
 */
export const SEMANTIC_ENRICHMENT_PROMOTED_STATUS = "promoted" as const;

/**
 * Decision-kind sentinel written to `ags_semantic_enrichment_decisions.decision`
 * for the audit trail on the source row. Operators see a clean
 * promotion record alongside any future approve/reject decisions on
 * the correction-proposal side.
 */
export const SEMANTIC_ENRICHMENT_PROMOTED_DECISION = "promoted" as const;

// ============================================================================
// Errors
// ============================================================================

export class EnrichmentProposalNotFoundError extends Error {
  constructor(public readonly proposalId: number) {
    super(`Semantic enrichment proposal ${proposalId} not found`);
    this.name = "EnrichmentProposalNotFoundError";
  }
}

export class EnrichmentProposalNotPromotableError extends Error {
  constructor(
    public readonly proposalId: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Semantic enrichment proposal ${proposalId} is not promotable ` +
        `(status="${currentStatus}"); only "pending" proposals may be promoted.`,
    );
    this.name = "EnrichmentProposalNotPromotableError";
  }
}

export class EnrichmentProposalAlreadyPromotedError extends Error {
  constructor(public readonly proposalId: number) {
    super(`Semantic enrichment proposal ${proposalId} is already promoted`);
    this.name = "EnrichmentProposalAlreadyPromotedError";
  }
}

// ============================================================================
// Conversion (pure)
// ============================================================================

/**
 * Row shape ready to insert into `ags_graph_correction_proposals`.
 * Mirrors the column types in `drizzle/tables/agent-studio-graph-quality.ts`.
 */
export interface CorrectionProposalRowFromEnrichment {
  readonly proposalKind: string;
  readonly targetTypeKey: string | null;
  readonly targetId: number | null;
  readonly proposedChange: Record<string, unknown>;
  readonly confidence: number;
  readonly rationale: string;
  readonly proposedByAgentId: number | null;
  readonly proposedByUserId: number | null;
  readonly status: "pending";
}

export interface ConvertSemanticEnrichmentOptions {
  /**
   * Optional agent id stamped onto the new correction proposal. The
   * semantic-enrichment agent's identity is captured here for audit;
   * the existing `ags_graph_correction_proposals` schema carries
   * `proposed_by_agent_id` for exactly this lineage.
   */
  readonly proposedByAgentId?: number | null;
  /**
   * Optional user id who triggered the promotion. Mutually
   * non-exclusive with `proposedByAgentId` — both can be set when an
   * operator triggers a promotion on an agent-generated proposal.
   */
  readonly proposedByUserId?: number | null;
}

/**
 * Pure conversion from a semantic-enrichment proposal detail row to
 * a graph-correction-proposal row ready to insert. Caller is
 * responsible for validating state (`pending`); this function only
 * shapes the row.
 *
 * Field mapping:
 *   - `proposalKind`, `targetTypeKey`, `targetId` → carry over verbatim
 *   - `payload`  → `proposedChange` (the actual change to apply)
 *   - `confidence` → numeric-coerced (string-in-DB → number-in-row)
 *   - `rationale` → derived from `sourceEvidence` (citation summary)
 *   - `proposedByAgentId` / `proposedByUserId` → from options
 *   - `status` → always `"pending"` (post-promotion the correction
 *     proposal awaits triage on the standard chain)
 */
export function convertSemanticEnrichmentToCorrectionProposal(
  source: SemanticEnrichmentProposalDetail,
  options: ConvertSemanticEnrichmentOptions = {},
): CorrectionProposalRowFromEnrichment {
  const confidence = parseConfidence(source.confidence);
  const rationale = buildRationaleFromEvidence(source);
  return {
    proposalKind: source.proposalKind,
    targetTypeKey: source.targetTypeKey,
    targetId: source.targetId,
    proposedChange: source.payload ?? {},
    confidence,
    rationale,
    proposedByAgentId: options.proposedByAgentId ?? null,
    proposedByUserId: options.proposedByUserId ?? null,
    status: "pending",
  };
}

function parseConfidence(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildRationaleFromEvidence(
  source: SemanticEnrichmentProposalDetail,
): string {
  const head =
    `Promoted from semantic enrichment proposal ${source.id} ` +
    `(kind=${source.proposalKind}, runId=${source.runId ?? "null"}).`;
  const evidence = source.sourceEvidence;
  if (!evidence) return head;
  const citations = (evidence as { citations?: unknown }).citations;
  if (Array.isArray(citations) && citations.length > 0) {
    return `${head} Source citations: ${citations.length} note-version(s).`;
  }
  return head;
}

// ============================================================================
// Promotion (writer with DI seams)
// ============================================================================

/**
 * Read fn: load the enrichment proposal detail row by id. Tests inject
 * an in-memory map; production wires this to
 * `createSemanticEnrichmentStore().getProposalDetail`.
 */
export type EnrichmentProposalReader = (
  proposalId: number,
) => Promise<SemanticEnrichmentProposalDetail | null>;

/**
 * Write fn: insert a correction-proposal row, return its new id.
 * Tests inject a recorder; production wires this to a Drizzle
 * `insert(agsGraphCorrectionProposals).values(row).returning({ id })`.
 */
export type CorrectionProposalWriter = (
  row: CorrectionProposalRowFromEnrichment,
) => Promise<{ readonly correctionProposalId: number }>;

/**
 * Write fn: update the source enrichment proposal's status to
 * `promoted`. Tests inject a recorder; production wires this to
 * `UPDATE ags_semantic_enrichment_proposals SET status = 'promoted'
 * WHERE id = $proposalId AND status = 'pending'` (note the
 * concurrency-safe `status='pending'` predicate — see
 * `wasUpdated` return).
 */
export type EnrichmentProposalStatusWriter = (input: {
  readonly proposalId: number;
  readonly nextStatus: typeof SEMANTIC_ENRICHMENT_PROMOTED_STATUS;
}) => Promise<{ readonly wasUpdated: boolean }>;

/**
 * Write fn: append a `promoted` decision row to
 * `ags_semantic_enrichment_decisions` for audit. Tests inject a
 * recorder; production wires this to a Drizzle insert.
 */
export type EnrichmentDecisionWriter = (input: {
  readonly proposalId: number;
  readonly decision: typeof SEMANTIC_ENRICHMENT_PROMOTED_DECISION;
  readonly decidedByUserId: number | null;
  readonly rationale: string | null;
  readonly correctionProposalId: number;
}) => Promise<void>;

export interface PromoteSemanticEnrichmentInput {
  readonly proposalId: number;
  /**
   * Optional user id triggering the promotion. Stamped onto the new
   * correction proposal AND the decision row. `null` when an
   * automated cron path drives the promotion.
   */
  readonly decidedByUserId?: number | null;
  /**
   * Optional operator-facing rationale recorded on the decision row.
   * Independent of the rationale derived for the correction proposal
   * (which comes from the enrichment's source evidence).
   */
  readonly decisionRationale?: string | null;
  /**
   * Optional agent id stamped onto the new correction proposal. Set
   * when the promotion is attributing the lineage to the
   * semantic-enrichment agent (vs. a human operator).
   */
  readonly proposedByAgentId?: number | null;
}

export interface PromoteSemanticEnrichmentDeps {
  readonly readEnrichmentProposal: EnrichmentProposalReader;
  readonly writeCorrectionProposal: CorrectionProposalWriter;
  readonly writeEnrichmentStatus: EnrichmentProposalStatusWriter;
  readonly writeEnrichmentDecision: EnrichmentDecisionWriter;
}

export interface PromoteSemanticEnrichmentResult {
  readonly correctionProposalId: number;
  readonly correctionProposalRow: CorrectionProposalRowFromEnrichment;
  readonly enrichmentProposalId: number;
}

/**
 * Bridge entry point. State transitions:
 *   1. Read enrichment proposal — throw if not found.
 *   2. Validate status — only `pending` is promotable.
 *      - `rejected_below_threshold` / unknown → `NotPromotableError`
 *      - `promoted` → `AlreadyPromotedError` (idempotency hint)
 *   3. Build correction-proposal row (pure conversion).
 *   4. Insert correction proposal — capture new id.
 *   5. Flip enrichment proposal status to `promoted`. If `wasUpdated`
 *      is false the row was concurrently mutated; throw
 *      `AlreadyPromotedError` to surface the race.
 *   6. Write decision row referencing the new correction proposal id.
 *      Failure here is non-fatal (logged); the promotion itself
 *      succeeded.
 */
export async function promoteSemanticEnrichmentProposal(
  input: PromoteSemanticEnrichmentInput,
  deps: PromoteSemanticEnrichmentDeps,
): Promise<PromoteSemanticEnrichmentResult> {
  const source = await deps.readEnrichmentProposal(input.proposalId);
  if (source === null) {
    throw new EnrichmentProposalNotFoundError(input.proposalId);
  }
  if (source.status === SEMANTIC_ENRICHMENT_PROMOTED_STATUS) {
    throw new EnrichmentProposalAlreadyPromotedError(input.proposalId);
  }
  if (source.status !== "pending") {
    throw new EnrichmentProposalNotPromotableError(
      input.proposalId,
      source.status,
    );
  }

  const correctionRow = convertSemanticEnrichmentToCorrectionProposal(source, {
    proposedByAgentId: input.proposedByAgentId ?? null,
    proposedByUserId: input.decidedByUserId ?? null,
  });
  const { correctionProposalId } =
    await deps.writeCorrectionProposal(correctionRow);

  const { wasUpdated } = await deps.writeEnrichmentStatus({
    proposalId: input.proposalId,
    nextStatus: SEMANTIC_ENRICHMENT_PROMOTED_STATUS,
  });
  if (!wasUpdated) {
    // Concurrent mutation — the source row's status changed between our
    // read and our update. Surface as already-promoted so the caller
    // doesn't see a half-applied promotion. The new correction proposal
    // is already inserted; that's documented as the trade-off above.
    throw new EnrichmentProposalAlreadyPromotedError(input.proposalId);
  }

  try {
    await deps.writeEnrichmentDecision({
      proposalId: input.proposalId,
      decision: SEMANTIC_ENRICHMENT_PROMOTED_DECISION,
      decidedByUserId: input.decidedByUserId ?? null,
      rationale: input.decisionRationale ?? null,
      correctionProposalId,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[T-D.4] enrichment-decision audit writer threw (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    correctionProposalId,
    correctionProposalRow: correctionRow,
    enrichmentProposalId: input.proposalId,
  };
}
