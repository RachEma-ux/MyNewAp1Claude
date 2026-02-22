/**
 * requireGate — Governance Bible CGT v2
 *
 * Phase 3 + Phase 5 — Mandatory Gate Enforcement
 * Role: CE-A (Backend Engine & Middleware)
 *
 * This is the single enforcement point for all lifecycle transitions.
 * Every lifecycle mutation MUST call requireGate() before proceeding.
 *
 * Enforcement:
 *   - Runs scorecard for the target stage
 *   - Returns ALLOW or DENY
 *   - DENY returns HTTP 409 (Conflict)
 *   - Frozen subjects are blocked before scoring
 *   - All decisions are audit-logged
 *   - No bypass path exists
 *
 * Usage:
 *   const verdict = await requireGate("validate", subject, actor);
 *   if (verdict.denied) throw new TRPCError({ code: "CONFLICT", message: verdict.reason });
 */

import { createHash } from "crypto";
import { runScorecard, isFrozen, getFreezeDetails, type ScorecardResult } from "./scorecard";
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
 * Returns ALLOW or DENY. Never throws — always returns a result.
 *
 * Checks (in order):
 *   1. Subject frozen? → DENY
 *   2. System-wide freeze? → DENY
 *   3. Run scorecard → evaluate gate
 *   4. Gate FAIL → DENY (409)
 *   5. Gate PASS → ALLOW (200)
 */
export function requireGate(
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
): GateResult {
  const audit = getAuditLogger();

  // ── Check 1: Subject frozen ──────────────────────────────────────────
  if (isFrozen(subject.id)) {
    const details = getFreezeDetails(subject.id);
    const reason = `Subject #${subject.id} "${subject.name}" is FROZEN: ${details?.reason || "governance freeze active"}`;

    const event = audit.log({
      actor_id: actor.id,
      action_type: "GATE_CHECK",
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

  // ── Check 2: System-wide freeze ──────────────────────────────────────
  if (isFrozen(0)) {
    const details = getFreezeDetails(0);
    const reason = `System-wide governance FREEZE active: ${details?.reason || "resolve drift violations first"}`;

    const event = audit.log({
      actor_id: actor.id,
      action_type: "GATE_CHECK",
      target_type: "lifecycle_gate",
      target_id: "system",
      decision_result: "denied",
      metadata: { stage, verdict: "DENY", reason, frozen: true, systemWide: true },
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

  // ── Check 3: Run scorecard ───────────────────────────────────────────
  const scorecardResult = runScorecard({
    stage,
    entry: subject,
    actor,
  });

  const gatePassed = scorecardResult.scorecard.gateStatus.passed;
  const verdict: GateVerdict = gatePassed ? "ALLOW" : "DENY";
  const reason = scorecardResult.scorecard.gateStatus.reason;

  // ── Audit log ────────────────────────────────────────────────────────
  const event = audit.log({
    actor_id: actor.id,
    action_type: "GATE_CHECK",
    target_type: "lifecycle_gate",
    target_id: String(subject.id),
    decision_result: gatePassed ? "success" : "denied",
    metadata: {
      stage,
      verdict,
      reason,
      score: scorecardResult.scorecard.score.score,
      riskCritical: scorecardResult.scorecard.riskBreakdown.critical,
      riskHigh: scorecardResult.scorecard.riskBreakdown.high,
      evidenceBundleId: scorecardResult.evidence.bundleId,
      evidenceHash: scorecardResult.evidence.integrityHash,
      blocked: scorecardResult.blocked,
    },
  });

  return {
    verdict,
    denied: !gatePassed,
    reason,
    httpStatus: scorecardResult.httpStatus,
    scorecard: scorecardResult,
    auditId: event.event_id,
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
