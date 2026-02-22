/**
 * Governance Scorecard Engine — Public API
 *
 * Governance Bible CGT v2 — Automated Scorecard Engine
 *
 * Exports:
 *   - Control Catalog (definitions, helpers)
 *   - Runner Framework (interface, registry, built-in runners)
 *   - Score Aggregator (weighted scoring, gate evaluation)
 *   - Evidence Bundle (immutable artifacts, hash verification)
 *   - Scorecard Engine (orchestrator)
 *   - Drift Detector (scheduled re-scoring)
 */

// Control Catalog
export {
  CONTROL_CATALOG,
  getActiveControls,
  getControlsForStage,
  getControlsByDomain,
  getControlById,
  getMaxScore,
  getRequiredRunnerIds,
  type ControlDefinition,
  type ControlDomain,
} from "./control-catalog";

// Runner Framework
export {
  registerRunner,
  getRunner,
  getAllRunners,
  buildResult,
  buildSkip,
  type ControlRunner,
  type RunnerContext,
  type ControlResult,
  type EvidenceArtifact,
} from "./runner";

// Score Aggregator
export {
  aggregateResults,
  type ScoreBreakdown,
  type GateEvaluation,
  type RiskBreakdown,
  type AggregatedScorecard,
} from "./aggregator";

// Evidence Bundle
export {
  generateEvidenceBundle,
  verifyBundleIntegrity,
  formatBundleSummary,
  type EvidenceBundle,
} from "./evidence";

// Scorecard Engine
export {
  runScorecard,
  getScorecardHistory,
  getLatestScorecard,
  type ScorecardRequest,
  type ScorecardResult,
} from "./engine";

// Drift Detector
export {
  detectDrift,
  startDriftDetection,
  stopDriftDetection,
  getLastDriftReport,
  getDriftHistory,
  isDriftDetectionActive,
  type DriftReport,
  type DriftConfig,
} from "./drift-detector";
