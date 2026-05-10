/**
 * Phase 11.5 — Drizzle-backed GraphChangeProposalAdapter (ASDB).
 *
 * Implements the {@link GraphChangeProposalAdapter} interface against
 * Postgres (ASDB) using Drizzle. Pairs with `lifecycle.ts` (pure
 * orchestration) and the tRPC router which calls
 * `_setGraphChangeProposalAdapter()` at boot.
 *
 * Design:
 *   - validate: rejects empty `items[]`, missing kind/items mismatch
 *     (e.g. an `entity_merge` proposal must include items kinded
 *     "entity").
 *   - evaluateGovernance: kind-driven policy. Most graph mutations
 *     require approval; only `projection_correction` auto-approves
 *     (low-risk: re-syncs Postgres-of-truth into Neo4j).
 *   - createProposal: inserts `ags_graph_change_proposals` (status=pending)
 *     + N rows in `ags_graph_change_proposal_items`.
 *   - approve / reject: inserts `ags_graph_change_decisions`, flips
 *     `ags_graph_change_proposals.status`.
 *   - withdraw: same shape as reject but with decision="withdraw" and
 *     status="withdrawn".
 *   - emitAuditEvent: appends to `ags_graph_change_audit_events`.
 *
 * ADRs:
 *   - docs/architecture/agent-studio-entity-resolution.md
 *   - docs/architecture/agent-studio-graph-provenance-lineage.md
 *   - docs/architecture/agent-studio-note-promotion-binding-semantics.md §4
 */

import { eq } from "drizzle-orm";
import type {
  GraphChangeProposalAdapter,
  GraphChangeProposalGovernanceResult,
  GraphChangeProposalKind,
  GraphChangeProposalRequest,
  GraphChangeProposalValidationOutcome,
} from "./lifecycle.js";
import {
  agsGraphChangeProposals,
  agsGraphChangeProposalItems,
  agsGraphChangeDecisions,
  agsGraphChangeAuditEvents,
} from "../../../../drizzle/tables/agent-studio-graph-promotion.js";

/**
 * The minimum Drizzle DB shape this adapter needs. Defined locally so
 * tests can pass a stub without importing the full ASDB connection module.
 */
export interface GraphChangeProposalAdapterDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
}

/**
 * Proposal kinds that auto-approve. `projection_correction` is the only
 * low-risk kind — it just re-syncs Postgres-of-truth into Neo4j without
 * mutating either store's domain data. Everything else (node/edge/entity
 * mutations, observation/provenance corrections) requires human or
 * elevated-agent approval.
 */
const AUTO_APPROVE_KINDS = new Set<GraphChangeProposalKind>([
  "projection_correction",
]);

export interface AsdbGraphChangeProposalAdapterOptions {
  readonly db: GraphChangeProposalAdapterDb;
  readonly autoApproveKinds?: ReadonlySet<GraphChangeProposalKind>;
}

export class AsdbGraphChangeProposalAdapter
  implements GraphChangeProposalAdapter
{
  private readonly db: GraphChangeProposalAdapterDb;
  private readonly autoApproveKinds: ReadonlySet<GraphChangeProposalKind>;

  constructor(opts: AsdbGraphChangeProposalAdapterOptions) {
    this.db = opts.db;
    this.autoApproveKinds = opts.autoApproveKinds ?? AUTO_APPROVE_KINDS;
  }

  async validate(
    request: GraphChangeProposalRequest,
  ): Promise<GraphChangeProposalValidationOutcome> {
    const errors: Array<{ field: string; message: string }> = [];

    if (!request.items || request.items.length === 0) {
      errors.push({
        field: "items",
        message: "proposal must include at least one item",
      });
    } else if (request.items.length > 50) {
      errors.push({
        field: "items",
        message: `proposal exceeds maximum batch size of 50 items (got ${request.items.length})`,
      });
    }

    // entity_merge / entity_split must reference entity items; surface
    // kind/item mismatches early so the operator sees a clear validation
    // error instead of an FK violation deep in the activation path.
    if (
      (request.proposalKind === "entity_merge" ||
        request.proposalKind === "entity_split") &&
      request.items?.length > 0
    ) {
      const wrongKindIdx = request.items.findIndex(
        (it) => it.itemKind !== "entity",
      );
      if (wrongKindIdx >= 0) {
        errors.push({
          field: `items[${wrongKindIdx}].itemKind`,
          message: `${request.proposalKind} proposals only accept entity items; got ${request.items[wrongKindIdx].itemKind}`,
        });
      }
    }

    if (
      request.proposedByUserId == null &&
      request.proposedByAgentId == null
    ) {
      errors.push({
        field: "proposedBy",
        message: "must provide proposedByUserId or proposedByAgentId",
      });
    }

    return { ok: errors.length === 0, errors };
  }

  async evaluateGovernance(
    request: GraphChangeProposalRequest,
    validation: GraphChangeProposalValidationOutcome,
  ): Promise<GraphChangeProposalGovernanceResult> {
    if (!validation.ok) {
      return {
        approved: false,
        approvalRequired: false,
        reason: "validation_failed",
      };
    }
    const autoApprove = this.autoApproveKinds.has(request.proposalKind);
    return {
      approved: autoApprove,
      approvalRequired: !autoApprove,
      reason: autoApprove ? "auto_approve_low_risk_kind" : "requires_approval",
    };
  }

  async createProposal(
    request: GraphChangeProposalRequest,
  ): Promise<{ proposalId: number }> {
    const inserted = await this.db
      .insert(agsGraphChangeProposals)
      .values({
        proposalKind: request.proposalKind,
        proposedByUserId: request.proposedByUserId,
        proposedByAgentId: request.proposedByAgentId,
        status: "pending",
        summary: request.summary,
        confidence: request.confidence,
      })
      .returning({ id: agsGraphChangeProposals.id });
    const proposalId = inserted[0].id;

    for (const item of request.items) {
      await this.db.insert(agsGraphChangeProposalItems).values({
        proposalId,
        itemKind: item.itemKind,
        itemPayload: item.itemPayload,
        sourceEvidence: item.sourceEvidence ?? null,
      });
    }

    return { proposalId };
  }

  async approve(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void> {
    await this.db.insert(agsGraphChangeDecisions).values({
      proposalId,
      decision: "approve",
      decidedByUserId,
      rationale,
    });
    await this.db
      .update(agsGraphChangeProposals)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(agsGraphChangeProposals.id, proposalId));
  }

  async reject(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void> {
    await this.db.insert(agsGraphChangeDecisions).values({
      proposalId,
      decision: "reject",
      decidedByUserId,
      rationale,
    });
    await this.db
      .update(agsGraphChangeProposals)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(agsGraphChangeProposals.id, proposalId));
  }

  async withdraw(
    proposalId: number,
    decidedByUserId: number,
  ): Promise<void> {
    await this.db.insert(agsGraphChangeDecisions).values({
      proposalId,
      decision: "withdraw",
      decidedByUserId,
    });
    await this.db
      .update(agsGraphChangeProposals)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(eq(agsGraphChangeProposals.id, proposalId));
  }

  async emitAuditEvent(
    proposalId: number,
    eventKind: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(agsGraphChangeAuditEvents).values({
      proposalId,
      eventKind,
      metadata: metadata ?? null,
    });
  }
}
