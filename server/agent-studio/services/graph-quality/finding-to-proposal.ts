/**
 * Finding → graph-correction proposal converter.
 *
 * Phase 23 §1 bridge between the scanner-side findings table
 * (`ags_graph_quality_findings`, populated by `runQualityScan` in
 * PR #473) and the proposal-side lifecycle service
 * (`services/graph-correction/`, PR #460 — wires
 * `ags_graph_correction_proposals` + decisions + audit events).
 *
 * An operator (or, later, an autonomous quality agent) picks a
 * pending finding and calls `convertFindingToProposal(findingId)`
 * to:
 *   1. Read the finding row.
 *   2. Map `findingClass` → `proposalKind` via the canonical table.
 *   3. Submit a graph-correction proposal carrying the finding as
 *      context inside `proposedChange.finding`.
 *   4. Back-link the finding row by setting `findings.proposal_id`.
 *
 * The proposed change does NOT yet describe the concrete graph
 * mutation — that's added by a follow-up "proposal payload builder"
 * in a later PR. This PR establishes the link; the change body is
 * the operator-actionable description of the finding.
 *
 * Idempotency: a finding that already has `proposal_id` set throws
 * `FindingAlreadyConvertedError`. A finding that does not exist
 * throws `FindingNotFoundError`. ASDB-null throws
 * `AsdbUnavailableError` (operator-surfaceable, not silently dropped
 * because the operator explicitly triggered the conversion).
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityFindings,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import {
  submitCorrectionProposal,
  type ServiceOptions as GraphCorrectionServiceOptions,
} from "../graph-correction/public-api.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class FindingNotFoundError extends Error {
  constructor(public readonly findingId: number) {
    super(`Graph quality finding ${findingId} not found`);
    this.name = "FindingNotFoundError";
  }
}

export class FindingAlreadyConvertedError extends Error {
  constructor(
    public readonly findingId: number,
    public readonly proposalId: number,
  ) {
    super(
      `Finding ${findingId} already converted to proposal ${proposalId}`,
    );
    this.name = "FindingAlreadyConvertedError";
  }
}

/**
 * Canonical map from `findingClass` → `proposalKind`. Future scanner
 * kinds add an entry here; unmapped kinds fall back to
 * `review_<findingClass>` so the operator still gets a proposal row.
 */
export const FINDING_CLASS_TO_PROPOSAL_KIND: Readonly<Record<string, string>> =
  {
    orphan_node: "link_or_archive_orphan_node",
    duplicate_entity: "merge_duplicate_entities",
  };

export function proposalKindForFinding(findingClass: string): string {
  return (
    FINDING_CLASS_TO_PROPOSAL_KIND[findingClass] ?? `review_${findingClass}`
  );
}

/**
 * Maps severity → confidence the proposal records. Used as a default
 * when the operator hasn't tuned the confidence by hand. Higher
 * severity = the scanner is more sure something is wrong, which
 * maps directly to proposal confidence.
 */
export function severityToConfidence(severity: string): number {
  switch (severity) {
    case "critical":
      return 0.95;
    case "high":
      return 0.8;
    case "medium":
      return 0.6;
    case "low":
      return 0.4;
    default:
      return 0.5;
  }
}

export interface ConvertFindingToProposalInput {
  readonly findingId: number;
  readonly proposedByUserId?: number;
  readonly proposedByAgentId?: number;
  readonly rationale?: string;
}

export interface ConvertFindingToProposalResult {
  readonly findingId: number;
  readonly proposalId: number;
  readonly proposalKind: string;
}

export interface ConvertFindingOptions {
  readonly getDb?: typeof getAsDb;
}

interface FindingRow {
  id: number;
  scanId: number;
  findingClass: string;
  severity: string;
  sourceTypeKey: string | null;
  sourceId: string | null;
  details: Record<string, unknown> | null;
  proposalId: number | null;
  createdAt: Date;
}

export async function convertFindingToProposal(
  input: ConvertFindingToProposalInput,
  options: ConvertFindingOptions = {},
): Promise<ConvertFindingToProposalResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const rows = (await db
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
    .where(eq(agsGraphQualityFindings.id, input.findingId))
    .limit(1)) as FindingRow[];

  const finding = rows[0];
  if (!finding) throw new FindingNotFoundError(input.findingId);
  if (finding.proposalId != null) {
    throw new FindingAlreadyConvertedError(
      input.findingId,
      finding.proposalId,
    );
  }

  const proposalKind = proposalKindForFinding(finding.findingClass);

  const submitOptions: GraphCorrectionServiceOptions = {
    getDb: options.getDb,
  };
  const proposal = await submitCorrectionProposal(
    {
      proposalKind,
      targetTypeKey: finding.sourceTypeKey,
      // targetId is integer-only in the proposals table; the finding's
      // `sourceId` is opaque text (e.g., "note:42") so we carry it in
      // proposedChange.finding.sourceId instead of the typed column.
      targetId: null,
      proposedChange: {
        finding: {
          id: finding.id,
          scanId: finding.scanId,
          findingClass: finding.findingClass,
          severity: finding.severity,
          sourceTypeKey: finding.sourceTypeKey,
          sourceId: finding.sourceId,
          details: finding.details,
        },
        suggestedAction: proposalKind,
      },
      confidence: severityToConfidence(finding.severity),
      rationale:
        input.rationale ??
        `Auto-generated from graph-quality finding ${finding.id} (${finding.findingClass}, ${finding.severity}).`,
      proposedByUserId: input.proposedByUserId ?? null,
      proposedByAgentId: input.proposedByAgentId ?? null,
    },
    submitOptions,
  );

  // Back-link the finding to the proposal.
  await db
    .update(agsGraphQualityFindings)
    .set({ proposalId: proposal.id })
    .where(eq(agsGraphQualityFindings.id, input.findingId));

  return {
    findingId: input.findingId,
    proposalId: proposal.id,
    proposalKind,
  };
}
