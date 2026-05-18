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
import {
  isPostApplyVerificationEnabled,
  verifyPostApply,
  type VerifyPostApplyResult,
} from "./post-apply-verification.js";
import type { QualityScannerRegistration } from "./scan-orchestrator.js";
import type { GraphRepository } from "../graph/repository/index.js";

export interface ApproveAndApplyInput {
  readonly proposalId: number;
  readonly decidedByUserId: number;
  readonly rationale?: string;
  /**
   * If set, threads through to `applyApprovedProposal` so the apply
   * step pushes a `graph_quality_proposal_applied` /
   * `graph_quality_proposal_apply_failed` notification to this user.
   * Best-effort — notification errors never break the combo.
   */
  readonly notifyUserId?: number;
}

export interface ApproveAndApplyOptions {
  readonly getDb?: typeof getAsDb;
  readonly registry?: ApplierRegistry;
  /**
   * Optional post-apply verification context. When provided AND the
   * env flag `AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED` is
   * truthy AND apply succeeded, the combo fires `verifyPostApply`
   * fire-and-forget. Verification failure NEVER breaks apply.
   *
   * Carrying these as optional keeps the combo's call sites that
   * don't have a scanner registry / graph repository (e.g.
   * `semantic-enrichment-promote-and-approve.ts` for now) working
   * without changes.
   */
  readonly scannerRegistry?: readonly QualityScannerRegistration[];
  readonly repository?: GraphRepository;
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
    { proposalId: input.proposalId, notifyUserId: input.notifyUserId },
    { getDb: options.getDb, registry: options.registry },
  );

  // Post-apply verification (T-D.5). Fire-and-forget so verification
  // can never break the combo. Gated on env flag + presence of the
  // scanner registry + repository + a successful apply.
  if (
    apply.result.applied &&
    options.scannerRegistry !== undefined &&
    options.repository !== undefined &&
    isPostApplyVerificationEnabled()
  ) {
    void runFireAndForgetVerification({
      proposalId: input.proposalId,
      registry: options.scannerRegistry,
      repository: options.repository,
      getDb: options.getDb,
    });
  }

  return { approval, apply };
}

async function runFireAndForgetVerification(args: {
  readonly proposalId: number;
  readonly registry: readonly QualityScannerRegistration[];
  readonly repository: GraphRepository;
  readonly getDb?: typeof getAsDb;
}): Promise<VerifyPostApplyResult | null> {
  try {
    return await verifyPostApply(
      { proposalId: args.proposalId },
      {
        registry: args.registry,
        repository: args.repository,
        ...(args.getDb !== undefined ? { getDb: args.getDb } : {}),
      },
    );
  } catch {
    // Fail-soft. Verification path runs detached from the apply
    // promise chain so the caller never observes a verification
    // throw. Operator dashboards see verification gaps as missing
    // audit rows.
    return null;
  }
}
