/**
 * requireGate — Governance Bible CGT v2
 *
 * Phase 3 + Phase 5 — Mandatory Gate Enforcement
 * Role: CE-A (Backend Engine & Middleware)
 *
 * This is the single enforcement point for all lifecycle transitions.
 * Every lifecycle mutation MUST call requireGate() before proceeding.
 *
 * Architecture — two strict phases:
 *
 *   PHASE A — Enforcement (blocking)
 *     Freeze check, scorecard evaluation, denial persistence.
 *     Failures here MUST propagate.
 *
 *   PHASE B — Observability (non-fatal)
 *     Evidence persistence, audit logging for ALLOW verdicts.
 *     Failures here are logged but NEVER block execution.
 *
 * Principle:
 *   Enforcement failure may block execution.
 *   Observability failure must NEVER block execution.
 *
 * Usage:
 *   const verdict = await requireGate("validate", subject, actor);
 *   if (verdict.denied) throw new TRPCError({ code: "CONFLICT", message: verdict.reason });
 */

import { createHash } from "crypto";
import { runScorecard, isFrozen, getFreezeDetails, type ScorecardResult } from "./scorecard";
import { persistEvidenceBundle } from "./scorecard/evidence";
import { getAuditLogger } from "../services/auditLogger";
import type { LifecycleStage } from "./lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export type GateVerdict = "ALLOW" | "DENY";

export interface GateResult {
  /** The verdict: ALLOW or DENY */
  verdict: GateVerdict;
  /** Whether the gate denied the transition */
  denied: boolean;
  /** Human-readable reason */
  reason: string;
  /** HTTP status to return (200 or 409) */
  httpStatus: 200 | 409;
  /** Scorecard result (if scoring was performed) */
  scorecard?: ScorecardResult;
  /** Audit log event ID */
  auditId: string;
  /** Frozen status */
  frozen: boolean;
  /** Freeze details if applicable */
  freezeDetails?: { reason: string; frozenAt: Date; frozenBy: string };
}

// ============================================================================
// requireGate — THE enforcement function
// ============================================================================

/**
 * Mandatory gate check for lifecycle transitions.
 *
 * MUST be called before ANY lifecycle mutation.
 * Returns ALLOW or DENY. Never throws on observability failures.
 *
 * PHASE A — Enforcement (blocking):
 *   1. Subject frozen? → DENY (denial audit is blocking)
 *   2. Run scorecard → evaluate gate
 *   3. Gate FAIL → DENY (denial audit is blocking)
 *
 * PHASE B — Observability (non-fatal):
 *   4. Persist evidence bundle (try/catch — never blocks)
 *   5. Audit log ALLOW verdict (try/catch — never blocks)
 *
 * System-wide freeze is handled by the requireFreeze middleware
 * in trpc.ts, which runs BEFORE this function.
 */
export async function requireGate(
  stage: LifecycleStage,
  subject: {
    id: number;
    name: string;
    type: string;
    tags: string[];
    description?: string;
    config?: any;
  },
  actor: {
    id: string;
    role: string;
  }
): Promise<GateResult> {
  const audit = getAuditLogger();

  // ====================================================================
  // PHASE A — Enforcement (blocking)
  // ====================================================================

  // ── A1: Subject frozen → DENY ─────────────────────────────────────
  if (isFrozen(subject.id)) {
    const details = getFreezeDetails(subject.id);
    const reason = `Subject #${subject.id} "${subject.name}" is FROZEN: ${details?.reason || "governance freeze active"}`;

    // Denial audit is blocking — must record why we blocked
    const event = await audit.log({
      actor_id: actor.id,
      principal_type: "human",
      action_type: "FREEZE_BLOCK",
      target_type: "lifecycle_gate",
      target_id: String(subject.id),
      decision_result: "denied",
      metadata: { stage, verdict: "DENY", reason, frozen: true },
    });

    return {
      verdict: "DENY",
      denied: true,
      reason,
      httpStatus: 409,
      auditId: event.event_id,
      frozen: true,
      freezeDetails: details ? {
        reason: details.reason,
        frozenAt: details.frozenAt,
        frozenBy: details.frozenBy,
      } : undefined,
    };
  }

  // ── A2: Run scorecard ─────────────────────────────────────────────
  const scorecardResult = await runScorecard({
    stage,
    entry: subject,
    actor,
  });

  const gatePassed = scorecardResult.scorecard.gateStatus.passed;
  const verdict: GateVerdict = gatePassed ? "ALLOW" : "DENY";
  const reason = scorecardResult.scorecard.gateStatus.reason;

  // ── A3: Gate DENY → blocking denial persistence ───────────────────
  if (!gatePassed) {
    // Denial audit is blocking — must durably record why we blocked
    const event = await audit.log({
      actor_id: actor.id,
      principal_type: "human",
      action_type: "GATE_CHECK",
      target_type: "lifecycle_gate",
      target_id: String(subject.id),
      decision_result: "denied",
      metadata: {
        stage,
        verdict: "DENY",
        reason,
        score: scorecardResult.scorecard.score.score,
        riskCritical: scorecardResult.scorecard.riskBreakdown.critical,
        riskHigh: scorecardResult.scorecard.riskBreakdown.high,
        evidenceBundleId: scorecardResult.evidence.bundleId,
        evidenceHash: scorecardResult.evidence.integrityHash,
        blocked: scorecardResult.blocked,
      },
    });

    // Evidence persistence for denials — also blocking (denial evidence is enforcement record)
    await persistEvidenceBundle(scorecardResult.evidence);

    return {
      verdict: "DENY",
      denied: true,
      reason,
      httpStatus: scorecardResult.httpStatus,
      scorecard: scorecardResult,
      auditId: event.event_id,
      frozen: false,
    };
  }

  // ====================================================================
  // PHASE B — Observability (non-fatal)
  // Gate PASSED — execution must proceed regardless of persistence.
  // ====================================================================

  let auditId = `local-${Date.now()}`;

  // ── B1: Persist evidence bundle (non-fatal) ───────────────────────
  try {
    await persistEvidenceBundle(scorecardResult.evidence);
  } catch (err) {
    console.error(
      `[requireGate] NON_FATAL_EVIDENCE_PERSISTENCE_FAILURE | ` +
      `subject_type=${subject.type} subject_id=${subject.id} ` +
      `stage=${stage} run_id=${scorecardResult.evidence.bundleId} ` +
      `error=${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── B2: Audit log ALLOW verdict (non-fatal) ──────────────────────
  try {
    const event = await audit.log({
      actor_id: actor.id,
      principal_type: "human",
      action_type: "GATE_CHECK",
      target_type: "lifecycle_gate",
      target_id: String(subject.id),
      decision_result: "success",
      metadata: {
        stage,
        verdict: "ALLOW",
        reason,
        score: scorecardResult.scorecard.score.score,
        riskCritical: scorecardResult.scorecard.riskBreakdown.critical,
        riskHigh: scorecardResult.scorecard.riskBreakdown.high,
        evidenceBundleId: scorecardResult.evidence.bundleId,
        evidenceHash: scorecardResult.evidence.integrityHash,
        blocked: false,
      },
    });
    auditId = event.event_id;
  } catch (err) {
    console.error(
      `[requireGate] NON_FATAL_AUDIT_LOG_FAILURE | ` +
      `subject_type=${subject.type} subject_id=${subject.id} ` +
      `stage=${stage} verdict=ALLOW ` +
      `error=${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    verdict: "ALLOW",
    denied: false,
    reason,
    httpStatus: scorecardResult.httpStatus,
    scorecard: scorecardResult,
    auditId,
    frozen: false,
  };
}

/**
 * Quick check: is a gate transition allowed without running full scorecard?
 * Used for UI enablement (show/hide buttons). Does NOT replace requireGate().
 */
export function canPassGate(subjectId: number): { allowed: boolean; reason?: string } {
  if (isFrozen(subjectId)) {
    const details = getFreezeDetails(subjectId);
    return { allowed: false, reason: `Subject frozen: ${details?.reason || "governance freeze"}` };
  }
  if (isFrozen(0)) {
    const details = getFreezeDetails(0);
    return { allowed: false, reason: `System freeze: ${details?.reason || "governance freeze"}` };
  }
  return { allowed: true };
}
