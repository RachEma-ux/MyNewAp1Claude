/**
 * KGIA Runtime Node — Request Human Review
 *
 * Checkpoint node that flags a run for human review when:
 * - Confidence is below the review threshold
 * - Governance verdict requires review
 * - Safety violations are present but not hard blocks
 */

import type { RuntimeState } from "../../domain/types";
import { DEFAULT_POLICY } from "../../governance/policies";
import { advanceNode } from "../state";

export interface ReviewRequest {
  runId: number;
  sessionId: number;
  reason: string;
  severity: "info" | "warning" | "critical";
  envelope?: unknown;
}

/**
 * Check if human review is required and mark the state accordingly.
 */
export function requestHumanReviewNode(state: RuntimeState): RuntimeState {
  const reasons: string[] = [];
  let severity: ReviewRequest["severity"] = "info";

  // Check confidence threshold
  if (state.envelope?.confidence) {
    const overall = state.envelope.confidence.overall;
    if (overall < DEFAULT_POLICY.reviewConfidenceThreshold) {
      reasons.push(`Confidence ${(overall * 100).toFixed(0)}% is below review threshold ${(DEFAULT_POLICY.reviewConfidenceThreshold * 100).toFixed(0)}%`);
      severity = "warning";
    }
  }

  // Check safety verdict
  if (state.safetyVerdict?.reviewRequired) {
    reasons.push("Safety gate flagged for review");
    severity = "critical";
  }

  // Check for non-blocking violations
  if (state.safetyVerdict?.violations && state.safetyVerdict.violations.length > 0 && state.safetyVerdict.safe) {
    reasons.push(`${state.safetyVerdict.violations.length} non-blocking violation(s) detected`);
    if (severity === "info") severity = "warning";
  }

  // Check missing knowledge
  if (state.envelope?.missingKnowledge && Array.isArray(state.envelope.missingKnowledge) && state.envelope.missingKnowledge.length > 0) {
    reasons.push("Knowledge gaps detected — answer may be incomplete");
  }

  const reviewRequired = reasons.length > 0;

  return advanceNode(
    {
      ...state,
      reviewRequired,
      reviewReasons: reasons,
      reviewSeverity: severity,
    } as RuntimeState & { reviewRequired: boolean; reviewReasons: string[]; reviewSeverity: string },
    "requestHumanReview"
  );
}
