/**
 * Promotion lifecycle.
 *
 * Phase 11. Handles note → CAG / Graph Skill / Tool Knowledge / Workflow /
 * Policy / Evaluation Case / Runtime Investigation / Graph Entity /
 * Knowledge Unit / Temporal Observation.
 *
 * Hooks into existing approval scaffolding (`agsApprovalSteps`,
 * `agsPendingPermissionRequests`, `evaluateGovernance()`).
 *
 * ADR: docs/architecture/agent-studio-note-promotion-binding-semantics.md
 */

import { recordFailureStateEvent } from "../failure-states/observability-bridge.js";

export type PromotionKind =
  | "knowledge_unit"
  | "cag_block"
  | "graph_skill_pack"
  | "tool_knowledge"
  | "workflow"
  | "policy"
  | "evaluation_case"
  | "runtime_investigation"
  | "graph_entity"
  | "temporal_observation";

/**
 * Closed-taxonomy promotion lifecycle status. Promoted to a tuple at
 * T-G.47 so the metadata table + lockstep tests can be authored.
 */
export const PROMOTION_STATUSES = [
  "pending",
  "validating",
  "in_review",
  "approved",
  "rejected",
  "rolled_back",
] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

// ============================================================================
// Per-promotion-status operator-facing metadata (T-G.47)
// ============================================================================

export interface PromotionStatusMetadata {
  /** Display label rendered in the promotion-request admin panel. */
  readonly label: string;
  /** Short operator-facing description of what this status means
   *  for the promotion's place in its lifecycle. */
  readonly description: string;
  /** Whether the status is terminal — no further lifecycle transitions
   *  expected (true for `approved` / `rejected` / `rolled_back`;
   *  false for the in-flight pending / validating / in_review). */
  readonly terminal: boolean;
  /** Whether the promotion materialized an activated version of the
   *  target asset (true for `approved` only; rejection and rollback
   *  leave the prior version active or no version active). */
  readonly producedActiveVersion: boolean;
}

export const PROMOTION_STATUS_METADATA: Readonly<
  Record<PromotionStatus, PromotionStatusMetadata>
> = {
  pending: {
    label: "Pending",
    description:
      "Promotion request created but validation has not started yet. Waiting for the validation worker to pick it up.",
    terminal: false,
    producedActiveVersion: false,
  },
  validating: {
    label: "Validating",
    description:
      "Validation in progress — schema, governance, and consistency checks running. No operator action yet.",
    terminal: false,
    producedActiveVersion: false,
  },
  in_review: {
    label: "In Review",
    description:
      "Validation passed; promotion sits with reviewers waiting for governance decision. Operator action required.",
    terminal: false,
    producedActiveVersion: false,
  },
  approved: {
    label: "Approved",
    description:
      "Reviewers approved the promotion and the target asset activated a new version. Terminal success state.",
    terminal: true,
    producedActiveVersion: true,
  },
  rejected: {
    label: "Rejected",
    description:
      "Reviewers rejected the promotion. No version was activated — prior version remains active (or none). Terminal failure state.",
    terminal: true,
    producedActiveVersion: false,
  },
  rolled_back: {
    label: "Rolled Back",
    description:
      "Promotion was approved and activated but later rolled back to the previous version. Terminal-with-history state.",
    terminal: true,
    producedActiveVersion: false,
  },
};

export function getPromotionStatusMetadata(
  status: PromotionStatus,
): PromotionStatusMetadata {
  return PROMOTION_STATUS_METADATA[status];
}

export interface PromotionRequest {
  readonly noteId: number;
  readonly noteVersionId: number;
  readonly promotionKind: PromotionKind;
  readonly initiatedByUserId: number;
  readonly rationale?: string;
}

export interface PromotionValidationOutcome {
  readonly ok: boolean;
  readonly errors: Array<{ field: string; message: string }>;
}

export interface PromotionGovernanceResult {
  readonly approved: boolean;
  readonly approvalRequired: boolean;
  readonly reviewers?: number[];
  readonly reason?: string;
}

export interface PromotionAdapter {
  validate(request: PromotionRequest): Promise<PromotionValidationOutcome>;
  evaluateGovernance(request: PromotionRequest, validation: PromotionValidationOutcome): Promise<PromotionGovernanceResult>;
  createDraft(request: PromotionRequest): Promise<{ promotionId: number; targetAssetId: number }>;
  activateVersion(promotionId: number, decidedByUserId: number): Promise<{ versionId: number }>;
  rollback(promotionId: number, decidedByUserId: number): Promise<{ activatedVersionId: number }>;
  emitProjectionEvent(promotionId: number, status: PromotionStatus): Promise<void>;
}

/**
 * Default lifecycle: validate → evaluate governance → require approval if
 * needed → create draft → activate or queue for review.
 *
 * Boundary contract:
 *   - Editing source note creates a new promotion candidate; does NOT
 *     mutate active runtime asset.
 *   - Approved promotion writes to Postgres source-of-truth, then projection
 *     sync updates Neo4j.
 *   - Rollback restores previous active version; auditable.
 */
export class PromotionLifecycle {
  constructor(private readonly adapter: PromotionAdapter) {}

  async submit(request: PromotionRequest): Promise<{ promotionId: number; status: PromotionStatus }> {
    const validation = await this.adapter.validate(request);
    if (!validation.ok) {
      // T-I.5 batch B — bridge validation-rejected promotions to the
      // Phase 22 closed-taxonomy emission surface. Critical severity
      // because a validation reject means the source note can't be
      // promoted as-requested — operator action required to remediate.
      // Fire-and-forget.
      void recordFailureStateEvent({
        failureState: "promotion_failed",
        sourceKind: "promotion-lifecycle.submit",
        sourceId: `note:${request.noteId}`,
        errorMessage: `Promotion validation rejected for ${request.promotionKind}: ${validation.errors.length} error(s)`,
        metadata: {
          noteId: request.noteId,
          noteVersionId: request.noteVersionId,
          promotionKind: request.promotionKind,
          initiatedByUserId: request.initiatedByUserId,
          rejectionStage: "validation",
          errorCount: validation.errors.length,
          errorFields: validation.errors.map((e) => e.field),
        },
      }).catch(() => {
        // Fail-soft.
      });
      return { promotionId: -1, status: "rejected" };
    }

    const governance = await this.adapter.evaluateGovernance(request, validation);
    const { promotionId } = await this.adapter.createDraft(request);

    if (governance.approvalRequired && !governance.approved) {
      await this.adapter.emitProjectionEvent(promotionId, "in_review");
      return { promotionId, status: "in_review" };
    }

    await this.adapter.activateVersion(promotionId, request.initiatedByUserId);
    await this.adapter.emitProjectionEvent(promotionId, "approved");
    return { promotionId, status: "approved" };
  }

  async approve(promotionId: number, decidedByUserId: number): Promise<{ status: PromotionStatus }> {
    await this.adapter.activateVersion(promotionId, decidedByUserId);
    await this.adapter.emitProjectionEvent(promotionId, "approved");
    return { status: "approved" };
  }

  async reject(promotionId: number, _decidedByUserId: number): Promise<{ status: PromotionStatus }> {
    await this.adapter.emitProjectionEvent(promotionId, "rejected");
    // T-I.5 batch B — operator-rejected promotions also flow through
    // the Phase 22 closed-taxonomy emission surface. Distinguished
    // from validation-stage rejection via `rejectionStage: "operator"`
    // in metadata. Fire-and-forget.
    void recordFailureStateEvent({
      failureState: "promotion_failed",
      sourceKind: "promotion-lifecycle.reject",
      sourceId: String(promotionId),
      errorMessage: `Promotion ${promotionId} rejected by operator`,
      metadata: {
        promotionId,
        decidedByUserId: _decidedByUserId,
        rejectionStage: "operator",
      },
    }).catch(() => {
      // Fail-soft.
    });
    return { status: "rejected" };
  }

  async rollback(promotionId: number, decidedByUserId: number): Promise<{ status: PromotionStatus; activatedVersionId: number }> {
    const { activatedVersionId } = await this.adapter.rollback(promotionId, decidedByUserId);
    await this.adapter.emitProjectionEvent(promotionId, "rolled_back");
    return { status: "rolled_back", activatedVersionId };
  }
}
