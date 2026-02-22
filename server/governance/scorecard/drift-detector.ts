/**
 * Drift Detection — Governance Bible CGT v2
 *
 * Scheduled post-publish governance re-scoring:
 *   - Compares current state against last known-good scorecard
 *   - Detects policy drift (config changes after publish)
 *   - Detects architecture drift (layer boundary violations)
 *   - Detects secret rotation drift (expired or unchanged secrets)
 *   - Triggers automatic re-score
 *   - Escalates on severity threshold breach
 */

import { runScorecard, getLatestScorecard, type ScorecardResult } from "./engine";
import type { LifecycleStage } from "../lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export interface DriftReport {
  /** When drift detection ran */
  timestamp: Date;
  /** Whether drift was detected */
  driftDetected: boolean;
  /** Score delta from last known-good */
  scoreDelta: number;
  /** Previous score */
  previousScore: number;
  /** Current score */
  currentScore: number;
  /** New violations since last check */
  newViolations: string[];
  /** Resolved violations since last check */
  resolvedViolations: string[];
  /** Whether re-score passed the gate */
  gatePassed: boolean;
  /** Escalation needed */
  escalationNeeded: boolean;
  /** Escalation reason */
  escalationReason?: string;
}

export interface DriftConfig {
  /** How often to run drift detection (ms). Default: 15 minutes. */
  intervalMs: number;
  /** Score drop threshold that triggers escalation. Default: 10 points. */
  scoreDropThreshold: number;
  /** Stage to evaluate against. Default: "publish". */
  stage: LifecycleStage;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: DriftConfig = {
  intervalMs: 15 * 60 * 1000, // 15 minutes
  scoreDropThreshold: 10,
  stage: "publish",
};

// ============================================================================
// Drift Detector
// ============================================================================

let _driftInterval: ReturnType<typeof setInterval> | null = null;
let _lastDriftReport: DriftReport | null = null;
const _driftHistory: DriftReport[] = [];
const MAX_DRIFT_HISTORY = 100;

/**
 * Run a single drift detection check.
 */
export function detectDrift(config?: Partial<DriftConfig>): DriftReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const previous = getLatestScorecard();

  // Run a fresh scorecard
  const current = runScorecard({
    stage: cfg.stage,
    actor: { id: "drift-detector", role: "system" },
  });

  const previousScore = previous?.scorecard.score.score ?? 100;
  const currentScore = current.scorecard.score.score;
  const scoreDelta = currentScore - previousScore;

  // Compare control results
  const previousFails = new Set(
    previous?.scorecard.controlResults
      .filter((r) => r.status === "fail")
      .map((r) => r.controlId) ?? []
  );
  const currentFails = new Set(
    current.scorecard.controlResults
      .filter((r) => r.status === "fail")
      .map((r) => r.controlId)
  );

  const newViolations = [...currentFails].filter((id) => !previousFails.has(id));
  const resolvedViolations = [...previousFails].filter((id) => !currentFails.has(id));

  const driftDetected = newViolations.length > 0 || resolvedViolations.length > 0;

  // Escalation logic
  let escalationNeeded = false;
  let escalationReason: string | undefined;

  if (scoreDelta <= -cfg.scoreDropThreshold) {
    escalationNeeded = true;
    escalationReason = `Score dropped ${Math.abs(scoreDelta)} points (threshold: ${cfg.scoreDropThreshold})`;
  }

  if (current.scorecard.riskBreakdown.critical > 0) {
    escalationNeeded = true;
    escalationReason = `${current.scorecard.riskBreakdown.critical} Critical violation(s) detected`;
  }

  const report: DriftReport = {
    timestamp: new Date(),
    driftDetected,
    scoreDelta,
    previousScore,
    currentScore,
    newViolations,
    resolvedViolations,
    gatePassed: current.scorecard.gateStatus.passed,
    escalationNeeded,
    escalationReason,
  };

  // Store
  _lastDriftReport = report;
  _driftHistory.push(report);
  if (_driftHistory.length > MAX_DRIFT_HISTORY) {
    _driftHistory.shift();
  }

  // Log
  if (driftDetected || escalationNeeded) {
    console.warn(
      `[Governance Drift] Score: ${previousScore} → ${currentScore} (delta: ${scoreDelta > 0 ? "+" : ""}${scoreDelta}). ` +
      `New violations: ${newViolations.length}. Resolved: ${resolvedViolations.length}. ` +
      (escalationNeeded ? `ESCALATION: ${escalationReason}` : "No escalation.")
    );
  }

  return report;
}

/**
 * Start scheduled drift detection.
 */
export function startDriftDetection(config?: Partial<DriftConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (_driftInterval) {
    console.warn("[Governance Drift] Already running — stopping previous interval");
    stopDriftDetection();
  }

  console.log(`[Governance Drift] Starting scheduled detection (interval: ${cfg.intervalMs}ms)`);

  _driftInterval = setInterval(() => {
    try {
      detectDrift(cfg);
    } catch (err) {
      console.error("[Governance Drift] Detection failed:", err);
    }
  }, cfg.intervalMs);
}

/**
 * Stop scheduled drift detection.
 */
export function stopDriftDetection(): void {
  if (_driftInterval) {
    clearInterval(_driftInterval);
    _driftInterval = null;
    console.log("[Governance Drift] Stopped scheduled detection");
  }
}

/**
 * Get the latest drift report.
 */
export function getLastDriftReport(): DriftReport | null {
  return _lastDriftReport;
}

/**
 * Get drift detection history.
 */
export function getDriftHistory(): DriftReport[] {
  return [..._driftHistory];
}

/**
 * Check if drift detection is currently active.
 */
export function isDriftDetectionActive(): boolean {
  return _driftInterval !== null;
}
