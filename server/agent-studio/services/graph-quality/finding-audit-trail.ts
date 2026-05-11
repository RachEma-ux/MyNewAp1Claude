/**
 * Single-finding audit trail.
 *
 * Phase 23 §1. Walks the full chain for a given finding id:
 *   finding row → linked proposal (if any) → audit events (if any)
 *     → applied details (if applied)
 *
 * Returns one bundled view. The operator UI uses this to render a
 * single-finding history panel — what was detected, when it was
 * converted to a proposal, what the operator decided, whether the
 * mutation worker applied it. Avoids round-tripping multiple
 * procedures.
 *
 * Idempotent + read-only. ASDB-null returns null (operator-surfaceable
 * — UI shows "history unavailable").
 */

import { desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityFindings,
  agsGraphCorrectionProposals,
  agsGraphCorrectionAuditEvents,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export interface FindingAuditTrailFindingRow {
  readonly id: number;
  readonly scanId: number;
  readonly findingClass: string;
  readonly severity: string;
  readonly sourceTypeKey: string | null;
  readonly sourceId: string | null;
  readonly details: Record<string, unknown> | null;
  readonly proposalId: number | null;
  readonly createdAt: Date;
}

export interface FindingAuditTrailProposalRow {
  readonly id: number;
  readonly proposalKind: string;
  readonly status: string;
  readonly confidence: string | null;
  readonly rationale: string | null;
  readonly proposedByUserId: number | null;
  readonly proposedByAgentId: number | null;
  readonly createdAt: Date;
}

export interface FindingAuditTrailAuditRow {
  readonly id: number;
  readonly eventKind: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface FindingAuditTrail {
  readonly finding: FindingAuditTrailFindingRow;
  readonly proposal: FindingAuditTrailProposalRow | null;
  readonly auditEvents: readonly FindingAuditTrailAuditRow[];
  /**
   * Convenience flags computed from the audit events, since the UI
   * almost always asks "is this resolved?" and walking the audit list
   * client-side is fiddly.
   */
  readonly state: {
    readonly hasProposal: boolean;
    readonly isApplied: boolean;
    readonly hasApplyFailed: boolean;
    readonly currentProposalStatus: string | null;
  };
}

export interface GetFindingAuditTrailOptions {
  readonly getDb?: typeof getAsDb;
}

export async function getFindingAuditTrail(
  findingId: number,
  options: GetFindingAuditTrailOptions = {},
): Promise<FindingAuditTrail | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const findingRows = (await db
    .select({
      id: agsGraphQualityFindings.id,
      scanId: agsGraphQualityFindings.scanId,
      findingClass: agsGraphQualityFindings.findingClass,
      severity: agsGraphQualityFindings.severity,
      sourceTypeKey: agsGraphQualityFindings.sourceTypeKey,
      sourceId: agsGraphQualityFindings.sourceId,
      details: agsGraphQualityFindings.details,
      proposalId: agsGraphQualityFindings.proposalId,
      createdAt: agsGraphQualityFindings.createdAt,
    })
    .from(agsGraphQualityFindings)
    .where(eq(agsGraphQualityFindings.id, findingId))
    .limit(1)) as FindingAuditTrailFindingRow[];

  const finding = findingRows[0];
  if (!finding) return null;

  let proposal: FindingAuditTrailProposalRow | null = null;
  let auditEvents: FindingAuditTrailAuditRow[] = [];

  if (finding.proposalId != null) {
    const proposalRows = (await db
      .select({
        id: agsGraphCorrectionProposals.id,
        proposalKind: agsGraphCorrectionProposals.proposalKind,
        status: agsGraphCorrectionProposals.status,
        confidence: agsGraphCorrectionProposals.confidence,
        rationale: agsGraphCorrectionProposals.rationale,
        proposedByUserId: agsGraphCorrectionProposals.proposedByUserId,
        proposedByAgentId: agsGraphCorrectionProposals.proposedByAgentId,
        createdAt: agsGraphCorrectionProposals.createdAt,
      })
      .from(agsGraphCorrectionProposals)
      .where(eq(agsGraphCorrectionProposals.id, finding.proposalId))
      .limit(1)) as FindingAuditTrailProposalRow[];
    proposal = proposalRows[0] ?? null;

    if (proposal) {
      auditEvents = (await db
        .select({
          id: agsGraphCorrectionAuditEvents.id,
          eventKind: agsGraphCorrectionAuditEvents.eventKind,
          metadata: agsGraphCorrectionAuditEvents.metadata,
          createdAt: agsGraphCorrectionAuditEvents.createdAt,
        })
        .from(agsGraphCorrectionAuditEvents)
        .where(eq(agsGraphCorrectionAuditEvents.proposalId, finding.proposalId))
        .orderBy(desc(agsGraphCorrectionAuditEvents.createdAt))) as FindingAuditTrailAuditRow[];
    }
  }

  const hasProposal = proposal !== null;
  const isApplied = auditEvents.some((e) => e.eventKind === "applied");
  const hasApplyFailed = auditEvents.some((e) => e.eventKind === "apply_failed");
  const currentProposalStatus = proposal ? proposal.status : null;

  return {
    finding,
    proposal,
    auditEvents,
    state: {
      hasProposal,
      isApplied,
      hasApplyFailed,
      currentProposalStatus,
    },
  };
}
