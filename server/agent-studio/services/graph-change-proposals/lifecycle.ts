/**
 * Graph change proposal lifecycle.
 *
 * Phase 11.5. Extends the promotion model beyond notes so graph
 * corrections (node create / update / deprecate, edge create / update /
 * remove, entity merge / split, observation correction, provenance
 * correction, projection correction) are governed.
 *
 * Adapters write to `ags_graph_change_proposals` + sibling tables;
 * the lifecycle here is pure orchestration so it can be unit-tested
 * without a DB.
 *
 * Boundary contract:
 *   - Agents cannot directly mutate Neo4j graph facts. All mutations
 *     route through a proposal + decision pair.
 *   - Approved proposals write Postgres source-of-truth, then the
 *     projection-sync worker (Phase 7.5+, shipped via PRs #1476-#1488)
 *     drains the enqueued rows and updates Neo4j.
 *   - Rejected proposals remain auditable (audit event row stays).
 *
 * ADR:
 *   - docs/architecture/agent-studio-entity-resolution.md
 *   - docs/architecture/agent-studio-graph-provenance-lineage.md
 *   - docs/architecture/agent-studio-note-promotion-binding-semantics.md (§4)
 */

export type GraphChangeProposalKind =
  | "create_node"
  | "update_node"
  | "deprecate_node"
  | "create_edge"
  | "update_edge"
  | "remove_edge"
  | "entity_merge"
  | "entity_split"
  | "observation_correction"
  | "provenance_correction"
  | "projection_correction";

export type GraphChangeProposalStatus =
  | "pending"
  | "validating"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface GraphChangeProposalItem {
  readonly itemKind: string;
  readonly itemPayload: Record<string, unknown>;
  readonly sourceEvidence?: Record<string, unknown>;
}

export interface GraphChangeProposalRequest {
  readonly proposalKind: GraphChangeProposalKind;
  readonly proposedByUserId?: number;
  readonly proposedByAgentId?: number;
  readonly summary?: string;
  readonly confidence?: "low" | "medium" | "high";
  readonly items: ReadonlyArray<GraphChangeProposalItem>;
}

export interface GraphChangeProposalValidationOutcome {
  readonly ok: boolean;
  readonly errors: Array<{ field: string; message: string }>;
}

export interface GraphChangeProposalGovernanceResult {
  readonly approved: boolean;
  readonly approvalRequired: boolean;
  readonly reviewers?: number[];
  readonly reason?: string;
}

export interface GraphChangeProposalAdapter {
  validate(
    request: GraphChangeProposalRequest,
  ): Promise<GraphChangeProposalValidationOutcome>;
  evaluateGovernance(
    request: GraphChangeProposalRequest,
    validation: GraphChangeProposalValidationOutcome,
  ): Promise<GraphChangeProposalGovernanceResult>;
  createProposal(
    request: GraphChangeProposalRequest,
  ): Promise<{ proposalId: number }>;
  approve(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void>;
  reject(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void>;
  withdraw(proposalId: number, decidedByUserId: number): Promise<void>;
  emitAuditEvent(
    proposalId: number,
    eventKind: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

/**
 * Default lifecycle: validate → governance → create → approve/queue.
 *
 * Mirrors PromotionLifecycle (Phase 11) so the operator-side review
 * surface can render a uniform pending-decisions list across both
 * note promotions and graph change proposals.
 */
export class GraphChangeProposalLifecycle {
  constructor(private readonly adapter: GraphChangeProposalAdapter) {}

  async submit(
    request: GraphChangeProposalRequest,
  ): Promise<{ proposalId: number; status: GraphChangeProposalStatus }> {
    const validation = await this.adapter.validate(request);
    if (!validation.ok) {
      return { proposalId: -1, status: "rejected" };
    }

    const governance = await this.adapter.evaluateGovernance(
      request,
      validation,
    );
    const { proposalId } = await this.adapter.createProposal(request);

    if (governance.approvalRequired && !governance.approved) {
      await this.adapter.emitAuditEvent(proposalId, "queued_for_review", {
        reviewers: governance.reviewers ?? [],
      });
      return { proposalId, status: "in_review" };
    }

    // Auto-approve path — typically reserved for low-risk projection
    // corrections proposed by trusted system agents. The adapter is
    // responsible for recording the decision row + audit event.
    await this.adapter.approve(
      proposalId,
      request.proposedByUserId ?? -1,
      "auto_approve",
    );
    await this.adapter.emitAuditEvent(proposalId, "auto_approved");
    return { proposalId, status: "approved" };
  }

  async approve(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<{ status: GraphChangeProposalStatus }> {
    await this.adapter.approve(proposalId, decidedByUserId, rationale);
    await this.adapter.emitAuditEvent(proposalId, "approved", { rationale });
    return { status: "approved" };
  }

  async reject(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<{ status: GraphChangeProposalStatus }> {
    await this.adapter.reject(proposalId, decidedByUserId, rationale);
    await this.adapter.emitAuditEvent(proposalId, "rejected", { rationale });
    return { status: "rejected" };
  }

  async withdraw(
    proposalId: number,
    decidedByUserId: number,
  ): Promise<{ status: GraphChangeProposalStatus }> {
    await this.adapter.withdraw(proposalId, decidedByUserId);
    await this.adapter.emitAuditEvent(proposalId, "withdrawn");
    return { status: "withdrawn" };
  }
}
