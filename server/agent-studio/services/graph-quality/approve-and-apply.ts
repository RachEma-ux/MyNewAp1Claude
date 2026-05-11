/**
 * Approve-and-apply combo.
 *
 * Phase 23 §1. Operator-convenience wrapper that approves a graph-
 * correction proposal AND immediately runs the mutation worker stub
 * in one call. Cuts the operator UI flow from two button clicks to
 * one when the operator has already triaged the finding and just
 * wants the fix applied.
 *
 * The combo composes two existing pieces:
 *   1. `approveCorrectionProposal` (graph-correction lifecycle)
 *   2. `applyApprovedProposal` (graph-quality mutation worker)
 *
 * It does NOT introduce new state guards beyond what the two underlying
 * functions enforce. If either step fails, the failure propagates and
 * the operator sees the same error they'd see calling them separately.
 *
 * Atomicity caveat: the two writes are NOT a single transaction. If
 * approval succeeds but apply fails, the proposal is left in
 * `status="approved"` with an `apply_failed` audit row. Re-calling the
 * combo will throw `ProposalAlreadyDecidedError` from the approval
 * step; the operator should instead call `applyApprovedProposal`
 * (or wait for an automated retry). This is intentional — the
 * approval state is the source of truth and surviving across retries
 * matters more than rollback complexity for a stub mutation worker.
 */

import { approveCorrectionProposal } from "../graph-correction/lifecycle.js";
import { applyApprovedProposal } from "./mutation-worker.js";
import type { getAsDb } from "../../db/connection.js";
import type {
  ApplyApprovedProposalResult,
  ApplierRegistry,
} from "./mutation-worker.js";
import type { ProposalRow } from "../graph-correction/lifecycle.js";

export interface ApproveAndApplyInput {
  readonly proposalId: number;
  readonly decidedByUserId: number;
  readonly rationale?: string;
}

export interface ApproveAndApplyOptions {
  readonly getDb?: typeof getAsDb;
  readonly registry?: ApplierRegistry;
}

export interface ApproveAndApplyResult {
  readonly approval: ProposalRow;
  readonly apply: ApplyApprovedProposalResult;
}

export async function approveAndApplyProposal(
  input: ApproveAndApplyInput,
  options: ApproveAndApplyOptions = {},
): Promise<ApproveAndApplyResult> {
  const approval = await approveCorrectionProposal(
    input.proposalId,
    input.decidedByUserId,
    input.rationale ?? null,
    { getDb: options.getDb },
  );
  const apply = await applyApprovedProposal(
    { proposalId: input.proposalId },
    { getDb: options.getDb, registry: options.registry },
  );
  return { approval, apply };
}
