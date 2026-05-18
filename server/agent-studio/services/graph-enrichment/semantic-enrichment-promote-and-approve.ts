/**
 * Semantic Enrichment promote-and-approve combo — T-D.4 slice 3.
 *
 * Operator-convenience wrapper that:
 *   1. Promotes a pending semantic-enrichment proposal into a
 *      graph-correction proposal (T-D.4 slice 1/2 chain).
 *   2. Immediately calls `approveAndApplyProposal` on the new
 *      correction proposal id (existing graph-quality chain).
 *
 * Cuts the operator UI flow from THREE button clicks
 * (promote → approve → apply) to ONE when the operator has already
 * triaged the enrichment proposal and just wants the fix shipped.
 *
 * Composes two existing pieces — does NOT introduce new state guards
 * beyond what they already enforce. If promotion succeeds but
 * approve-and-apply fails, the enrichment proposal is left in
 * `status="promoted"` and the new correction proposal stays in
 * `status="pending"`. Re-calling the combo will throw
 * `EnrichmentProposalAlreadyPromotedError` from the promote step; the
 * operator should call `approveAndApplyProposal({ proposalId: <newCorrectionId> })`
 * directly to finish the flow.
 *
 * Atomicity caveat (mirrors `approveAndApplyProposal`'s own caveat):
 * the two writes are NOT a single transaction. If promotion succeeds
 * but approval / apply fails, the proposal is left in
 * `status="approved"` (or `pending` if approval itself never ran) with
 * an `apply_failed` audit row. The promotion state remains
 * irreversible — operators should NOT retry the combo for a single
 * proposal; they should instead call the downstream steps directly.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No new graph mutation paths — both halves of the combo are
 *     already audited boundaries.
 *   - Audit trail preserved: promotion writes
 *     `ags_semantic_enrichment_decisions`; apply writes
 *     `ags_graph_correction_audit_events`. Operators see both.
 *   - `adminProcedure` floor preserved at the router boundary.
 */

import {
  approveAndApplyProposal,
  type ApproveAndApplyOptions,
  type ApproveAndApplyResult,
} from "../graph-quality/public-api.js";
import {
  runPromoteSemanticEnrichment,
  type RunPromoteSemanticEnrichmentOptions,
} from "./semantic-enrichment-promote-runner.js";
import type { PromoteSemanticEnrichmentResult } from "./semantic-enrichment-promotion-bridge.js";

export interface PromoteAndApproveInput {
  /**
   * The id of the SOURCE semantic-enrichment proposal to promote +
   * approve-and-apply. The new correction-proposal id is allocated
   * server-side during promotion.
   */
  readonly proposalId: number;
  /**
   * The user id triggering this combo. Stamped onto BOTH the
   * promotion decision (audit on the enrichment side) AND the
   * approve-and-apply decision (audit on the correction side).
   */
  readonly decidedByUserId: number;
  /**
   * Optional rationale recorded on BOTH the promotion decision AND
   * the approve-and-apply decision. Operators answering "why now?"
   * once gets that answer on both audit rows.
   */
  readonly rationale?: string;
  /**
   * Optional agent id stamped onto the new correction proposal's
   * `proposed_by_agent_id` column (the lineage on the correction
   * surface, distinct from the operator who triggered the combo).
   */
  readonly proposedByAgentId?: number | null;
  /**
   * Optional: forwarded to `approveAndApplyProposal` so the apply
   * step pushes a notification to this user when the mutation
   * lands (or fails).
   */
  readonly notifyUserId?: number;
}

export interface PromoteAndApproveOptions {
  /**
   * Test-seam DB shared by both halves of the combo. Production omits
   * this — both halves resolve via their own `getAsDb()` paths.
   */
  readonly db?: RunPromoteSemanticEnrichmentOptions["db"];
  /**
   * Optional override passed through to `approveAndApplyProposal` for
   * the applier registry. Tests inject a stub registry; production
   * uses the default repository-backed applier.
   */
  readonly applierRegistry?: ApproveAndApplyOptions["registry"];
  /**
   * Optional override for `getAsDb` passed through to
   * `approveAndApplyProposal`. Tests can inject a fake; production
   * omits this and the chain uses the live `getAsDb()`.
   */
  readonly getDb?: ApproveAndApplyOptions["getDb"];
}

export interface PromoteAndApproveResult {
  readonly promote: PromoteSemanticEnrichmentResult;
  readonly approveAndApply: ApproveAndApplyResult;
}

/**
 * Run the two-step combo: promote then approve-and-apply.
 *
 * Steps:
 *   1. `runPromoteSemanticEnrichment(input, { db })` — produces the
 *      new correction-proposal id (and the row + audit trail).
 *   2. `approveAndApplyProposal({ proposalId: newCorrectionId, ... },
 *      { getDb, registry })` — runs the existing graph-quality
 *      approve-then-apply chain on the new correction proposal.
 *
 * Errors from either step propagate; the operator sees the same
 * error they'd see calling the underlying step directly.
 */
export async function promoteAndApproveProposal(
  input: PromoteAndApproveInput,
  options: PromoteAndApproveOptions = {},
): Promise<PromoteAndApproveResult> {
  const promote = await runPromoteSemanticEnrichment(
    {
      proposalId: input.proposalId,
      decidedByUserId: input.decidedByUserId,
      ...(input.rationale !== undefined
        ? { decisionRationale: input.rationale }
        : {}),
      ...(input.proposedByAgentId !== undefined
        ? { proposedByAgentId: input.proposedByAgentId }
        : {}),
    },
    options.db !== undefined ? { db: options.db } : {},
  );

  const approveAndApply = await approveAndApplyProposal(
    {
      proposalId: promote.correctionProposalId,
      decidedByUserId: input.decidedByUserId,
      ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
      ...(input.notifyUserId !== undefined
        ? { notifyUserId: input.notifyUserId }
        : {}),
    },
    {
      ...(options.getDb !== undefined ? { getDb: options.getDb } : {}),
      ...(options.applierRegistry !== undefined
        ? { registry: options.applierRegistry }
        : {}),
    },
  );

  return { promote, approveAndApply };
}
