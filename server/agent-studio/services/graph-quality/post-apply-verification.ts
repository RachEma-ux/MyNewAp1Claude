/**
 * Post-apply verification — T-D.5 Quality Agent feedback circuit.
 *
 * After `applyApprovedProposal` writes `event_kind="applied"` to
 * `ags_graph_correction_audit_events`, the question "did the fix
 * actually work?" is still unanswered. The applier only confirms the
 * mutation succeeded in code; it does not confirm the originating
 * finding has been resolved against the now-mutated graph.
 *
 * This module closes that loop:
 *   1. Read the applied proposal's embedded finding context
 *      (`proposedChange.finding.{id, findingClass, sourceTypeKey, sourceId}`)
 *   2. Re-run the originating scanner (`findingClass` === `scanKind`)
 *      via the existing `runQualityScan` orchestrator
 *   3. Check whether the new scan emitted a finding with matching
 *      `(sourceTypeKey, sourceId)` — i.e. is the same issue still
 *      flagged after the fix?
 *   4. Insert a new `ags_graph_correction_audit_events` row with
 *      `event_kind` ∈ {`verification_pass`, `verification_fail`,
 *      `verification_skipped`} so the operator dashboard can render
 *      the verdict alongside the apply audit row.
 *
 * Skip reasons (recorded as `verification_skipped`):
 *   - `no_originating_finding` — proposal had no `proposedChange.finding`
 *     (e.g. operator-issued correction not derived from a scanner)
 *   - `scanner_not_registered` — the referenced `findingClass` doesn't
 *     map to any registered scanner (drift)
 *   - `asdb_unavailable` — ASDB returned null mid-verification
 *
 * Verification is gated downstream behind env flag
 * `AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED` (default off
 * for the first PR; ops can flip it on after observing). The combo
 * (`approveAndApplyProposal`) reads this flag and fires verification
 * fire-and-forget so a verification failure can never break apply.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import — verification reuses `runQualityScan`
 *     which already routes through `GraphRepository`.
 *   - No `openrouter` / `dispatchMcpToolCall`.
 *   - Mutation step happens only inside the embedded `runQualityScan`
 *     (which writes scan + finding rows to ASDB, never to Neo4j).
 *   - All Postgres writes confined to `ags_graph_correction_audit_events`
 *     + the scan+findings rows from the embedded scan.
 */

import { and, eq } from "drizzle-orm";
import type { getAsDb } from "../../db/connection.js";
import { getAsDb as defaultGetAsDb } from "../../db/connection.js";
import {
  agsGraphCorrectionAuditEvents,
  agsGraphCorrectionProposals,
  agsGraphQualityFindings,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import {
  runQualityScan,
  type QualityScannerRegistration,
} from "./scan-orchestrator.js";
import type { GraphRepository } from "../graph/repository/index.js";

export type VerificationOutcome =
  | "verification_pass"
  | "verification_fail"
  | "verification_skipped";

export type VerificationSkipReason =
  | "no_originating_finding"
  | "scanner_not_registered"
  | "asdb_unavailable";

export interface VerifyPostApplyInput {
  readonly proposalId: number;
}

export interface VerifyPostApplyOptions {
  readonly registry: readonly QualityScannerRegistration[];
  readonly repository: GraphRepository;
  readonly getDb?: typeof getAsDb;
}

export interface VerifyPostApplyResult {
  readonly proposalId: number;
  readonly outcome: VerificationOutcome;
  readonly auditEventId: number | null;
  readonly skipReason?: VerificationSkipReason;
  readonly originatingScanKind?: string;
  readonly verificationScanId?: number | null;
  readonly stillPresent?: boolean;
}

export class ProposalNotFoundForVerificationError extends Error {
  constructor(proposalId: number) {
    super(`Proposal ${proposalId} not found for post-apply verification`);
    this.name = "ProposalNotFoundForVerificationError";
  }
}

interface OriginatingFindingContext {
  readonly findingId: number;
  readonly findingClass: string;
  readonly sourceTypeKey: string | null;
  readonly sourceId: string | null;
}

function extractOriginatingFinding(
  proposedChange: unknown,
): OriginatingFindingContext | null {
  if (
    !proposedChange ||
    typeof proposedChange !== "object" ||
    Array.isArray(proposedChange)
  ) {
    return null;
  }
  const findingBlob = (proposedChange as Record<string, unknown>).finding;
  if (
    !findingBlob ||
    typeof findingBlob !== "object" ||
    Array.isArray(findingBlob)
  ) {
    return null;
  }
  const f = findingBlob as Record<string, unknown>;
  if (typeof f.id !== "number" || typeof f.findingClass !== "string") {
    return null;
  }
  return {
    findingId: f.id,
    findingClass: f.findingClass,
    sourceTypeKey:
      typeof f.sourceTypeKey === "string" ? f.sourceTypeKey : null,
    sourceId: typeof f.sourceId === "string" ? f.sourceId : null,
  };
}

/**
 * Runs a post-apply verification for `proposalId`. Returns a result
 * envelope describing the outcome; ALSO inserts an
 * `ags_graph_correction_audit_events` row recording the verdict so
 * the operator dashboard can render it alongside the apply audit row.
 *
 * Fail-soft: this function NEVER throws on a missing finding context
 * or an unregistered scanner — it records `verification_skipped`.
 * The only throw paths are (1) the proposal itself doesn't exist
 * (caller bug), or (2) the embedded `runQualityScan` rejects (e.g.,
 * scanner throws). The combo at `approveAndApplyProposal` fires this
 * verification fire-and-forget so even (2) cannot break apply.
 */
export async function verifyPostApply(
  input: VerifyPostApplyInput,
  options: VerifyPostApplyOptions,
): Promise<VerifyPostApplyResult> {
  const getDb = options.getDb ?? defaultGetAsDb;
  const db = getDb();
  if (!db) {
    return {
      proposalId: input.proposalId,
      outcome: "verification_skipped",
      auditEventId: null,
      skipReason: "asdb_unavailable",
    };
  }

  // Load the proposal so we can pull the embedded finding context.
  const proposalRows = await db
    .select({
      id: agsGraphCorrectionProposals.id,
      proposedChange: agsGraphCorrectionProposals.proposedChange,
    })
    .from(agsGraphCorrectionProposals)
    .where(eq(agsGraphCorrectionProposals.id, input.proposalId))
    .limit(1);
  const proposal = proposalRows[0];
  if (!proposal) {
    throw new ProposalNotFoundForVerificationError(input.proposalId);
  }

  const origin = extractOriginatingFinding(proposal.proposedChange);
  if (!origin) {
    const inserted = await db
      .insert(agsGraphCorrectionAuditEvents)
      .values({
        proposalId: input.proposalId,
        eventKind: "verification_skipped",
        metadata: { skipReason: "no_originating_finding" },
      })
      .returning({ id: agsGraphCorrectionAuditEvents.id });
    return {
      proposalId: input.proposalId,
      outcome: "verification_skipped",
      auditEventId: inserted[0]?.id ?? null,
      skipReason: "no_originating_finding",
    };
  }

  const scanKind = origin.findingClass;
  const registered = options.registry.find((r) => r.scanKind === scanKind);
  if (!registered) {
    const inserted = await db
      .insert(agsGraphCorrectionAuditEvents)
      .values({
        proposalId: input.proposalId,
        eventKind: "verification_skipped",
        metadata: {
          skipReason: "scanner_not_registered",
          originatingScanKind: scanKind,
        },
      })
      .returning({ id: agsGraphCorrectionAuditEvents.id });
    return {
      proposalId: input.proposalId,
      outcome: "verification_skipped",
      auditEventId: inserted[0]?.id ?? null,
      skipReason: "scanner_not_registered",
      originatingScanKind: scanKind,
    };
  }

  // Re-run the originating scanner.
  const verificationScan = await runQualityScan(
    { scanKind },
    {
      registry: options.registry,
      repository: options.repository,
      getDb,
    },
  );

  // Check whether the new scan emits a finding with the same
  // (sourceTypeKey, sourceId) pair. If yes → the originating issue
  // is still flagged → verification_fail. If no → verification_pass.
  let stillPresent = false;
  if (
    verificationScan.scanId != null &&
    origin.sourceTypeKey != null &&
    origin.sourceId != null
  ) {
    const matches = await db
      .select({ id: agsGraphQualityFindings.id })
      .from(agsGraphQualityFindings)
      .where(
        and(
          eq(agsGraphQualityFindings.scanId, verificationScan.scanId),
          eq(agsGraphQualityFindings.findingClass, scanKind),
          eq(agsGraphQualityFindings.sourceTypeKey, origin.sourceTypeKey),
          eq(agsGraphQualityFindings.sourceId, origin.sourceId),
        ),
      )
      .limit(1);
    stillPresent = matches.length > 0;
  } else if (verificationScan.scanId != null) {
    // No source identity to compare against — fall back to the
    // findings-count proxy. If the new scan finds zero of this kind,
    // call it a pass; otherwise fail (conservative — operator can
    // re-triage).
    stillPresent = verificationScan.findingsCount > 0;
  }

  const outcome: "verification_pass" | "verification_fail" = stillPresent
    ? "verification_fail"
    : "verification_pass";

  const inserted = await db
    .insert(agsGraphCorrectionAuditEvents)
    .values({
      proposalId: input.proposalId,
      eventKind: outcome,
      metadata: {
        originatingFindingId: origin.findingId,
        originatingScanKind: scanKind,
        originatingSourceTypeKey: origin.sourceTypeKey,
        originatingSourceId: origin.sourceId,
        verificationScanId: verificationScan.scanId,
        verificationScanStatus: verificationScan.status,
        verificationFindingsCount: verificationScan.findingsCount,
        stillPresent,
      },
    })
    .returning({ id: agsGraphCorrectionAuditEvents.id });

  return {
    proposalId: input.proposalId,
    outcome,
    auditEventId: inserted[0]?.id ?? null,
    originatingScanKind: scanKind,
    verificationScanId: verificationScan.scanId,
    stillPresent,
  };
}

/**
 * Env-flag check for the optional post-apply verification hook in
 * `approveAndApplyProposal`. Truthy values: "1", "true", "TRUE"
 * (anything else is off). Default OFF for the first PR — operators
 * flip the flag once they're happy with the verification verdicts.
 */
export function isPostApplyVerificationEnabled(): boolean {
  const v = process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED;
  if (v === undefined || v === null) return false;
  return v === "1" || v.toLowerCase() === "true";
}
