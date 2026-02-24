/**
 * Score Aggregator — Governance Bible CGT v2
 *
 * Implements:
 *   - Weighted scoring model (0–100)
 *   - Gate evaluation logic per lifecycle stage
 *   - Risk summary calculation
 *   - Stage-specific gating
 *
 * Scoring formula:
 *   score = (sum of passed control weights / sum of all evaluated control weights) * 100
 *
 * Gate rules:
 *   - Register:  No Critical findings
 *   - Validate:  No Critical or High findings
 *   - Publish:   No Critical, High, or Medium findings; score >= 80
 *   - Catalog:   All controls pass; score = 100
 */

import type { ControlResult } from "./runner";
import type { ControlDefinition } from "./control-catalog";
import type { LifecycleStage } from "../lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export interface ScoreBreakdown {
  /** Overall score 0–100 */
  score: number;
  /** Maximum possible score (if all pass) */
  maxWeight: number;
  /** Achieved weight */
  achievedWeight: number;
  /** Per-domain scores */
  domainScores: Record<string, { score: number; maxWeight: number; achievedWeight: number }>;
}

export interface GateEvaluation {
  /** The stage being evaluated */
  stage: LifecycleStage;
  /** Whether the gate passes */
  passed: boolean;
  /** Human-readable reason */
  reason: string;
  /** Which controls blocked the gate */
  blockingControls: string[];
  /** Minimum score required for this stage */
  requiredScore: number;
  /** Actual score */
  actualScore: number;
}

export interface RiskBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface AggregatedScorecard {
  score: ScoreBreakdown;
  gateStatus: GateEvaluation;
  /** Overall gate verdict: ALLOW or DENY (non-negotiable) */
  gateVerdict: "ALLOW" | "DENY";
  riskBreakdown: RiskBreakdown;
  controlResults: ControlResult[];
  passCount: number;
  failCount: number;
  skipCount: number;
  timestamp: Date;
}

// ============================================================================
// Score Thresholds per Stage
// ============================================================================

const STAGE_THRESHOLDS: Record<string, { minScore: number; maxSeverityAllowed: string }> = {
  submit:    { minScore: 0,   maxSeverityAllowed: "critical" }, // Allow all — entry point
  mutate:    { minScore: 0,   maxSeverityAllowed: "critical" }, // Allow all — system mutations (freeze-only gate)
  register:  { minScore: 0,   maxSeverityAllowed: "high" },    // No Critical
  validate:  { minScore: 50,  maxSeverityAllowed: "medium" },  // No Critical/High
  publish:   { minScore: 80,  maxSeverityAllowed: "low" },     // No Critical/High/Medium
  catalog:   { minScore: 100, maxSeverityAllowed: "low" },     // All pass
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================================================
// Aggregator
// ============================================================================

/**
 * Aggregate control results into a scored scorecard.
 */
export function aggregateResults(
  results: ControlResult[],
  controls: ControlDefinition[],
  stage: LifecycleStage
): AggregatedScorecard {
  // Build control lookup
  const controlMap = new Map(controls.map((c) => [c.id, c]));

  // Calculate weights
  let totalWeight = 0;
  let achievedWeight = 0;
  const domainWeights: Record<string, { total: number; achieved: number }> = {};

  for (const result of results) {
    const control = controlMap.get(result.controlId);
    if (!control || result.status === "skip") continue;

    const weight = control.weight;
    totalWeight += weight;

    if (!domainWeights[control.domain]) {
      domainWeights[control.domain] = { total: 0, achieved: 0 };
    }
    domainWeights[control.domain].total += weight;

    if (result.status === "pass") {
      achievedWeight += weight;
      domainWeights[control.domain].achieved += weight;
    }
  }

  // Calculate scores
  const overallScore = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;

  const domainScores: Record<string, { score: number; maxWeight: number; achievedWeight: number }> = {};
  for (const [domain, weights] of Object.entries(domainWeights)) {
    domainScores[domain] = {
      score: weights.total > 0 ? Math.round((weights.achieved / weights.total) * 100) : 0,
      maxWeight: weights.total,
      achievedWeight: weights.achieved,
    };
  }

  // Risk breakdown
  const riskBreakdown: RiskBreakdown = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const result of results) {
    if (result.status === "fail") {
      riskBreakdown[result.severity]++;
      riskBreakdown.total++;
    }
  }

  // Gate evaluation
  const gateStatus = evaluateGate(results, controls, stage, overallScore);

  // Counts
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const skipCount = results.filter((r) => r.status === "skip").length;

  return {
    score: {
      score: overallScore,
      maxWeight: totalWeight,
      achievedWeight,
      domainScores,
    },
    gateStatus,
    gateVerdict: gateStatus.passed ? "ALLOW" as const : "DENY" as const,
    riskBreakdown,
    controlResults: results,
    passCount,
    failCount,
    skipCount,
    timestamp: new Date(),
  };
}

/**
 * Evaluate whether a stage gate passes.
 */
function evaluateGate(
  results: ControlResult[],
  controls: ControlDefinition[],
  stage: LifecycleStage,
  score: number
): GateEvaluation {
  const threshold = STAGE_THRESHOLDS[stage];
  if (!threshold) {
    throw new Error(
      `[Governance] Unknown lifecycle stage "${stage}" — no fallback allowed. ` +
      `Valid stages: ${Object.keys(STAGE_THRESHOLDS).join(", ")}`
    );
  }
  const blockingControls: string[] = [];

  // Check for severity violations
  for (const result of results) {
    if (result.status !== "fail") continue;

    const severityLevel = SEVERITY_ORDER[result.severity] ?? 3;
    const maxAllowed = SEVERITY_ORDER[threshold.maxSeverityAllowed] ?? 3;

    if (severityLevel < maxAllowed) {
      blockingControls.push(`${result.controlId}: [${result.severity.toUpperCase()}] ${result.details}`);
    }
  }

  const scorePassed = score >= threshold.minScore;
  const severityPassed = blockingControls.length === 0;
  const passed = scorePassed && severityPassed;

  let reason: string;
  if (passed) {
    reason = `Gate PASS: score ${score}/${threshold.minScore} min, no blocking violations`;
  } else {
    const parts: string[] = [];
    if (!scorePassed) parts.push(`Score ${score} < ${threshold.minScore} minimum`);
    if (!severityPassed) parts.push(`${blockingControls.length} blocking violation(s)`);
    reason = `Gate FAIL: ${parts.join("; ")}`;
  }

  return {
    stage,
    passed,
    reason,
    blockingControls,
    requiredScore: threshold.minScore,
    actualScore: score,
  };
}
