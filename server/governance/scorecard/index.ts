/**
 * Governance Scorecard Engine — Public API
 *
 * Governance Bible CGT v2 — Automated Scorecard Engine
 *
 * Exports:
 *   - GovernedSubject (contract, validation, types)
 *   - Pack Resolver (pack resolution, helpers)
 *   - Control Catalog (definitions, helpers)
 *   - Runner Framework (interface, registry, built-in runners)
 *   - Score Aggregator (weighted scoring, gate evaluation)
 *   - Evidence Bundle (immutable artifacts, hash verification)
 *   - Scorecard Engine (orchestrator)
 *   - Drift Detector (scheduled re-scoring, freeze)
 */

// GovernedSubject Contract
export {
  SUBJECT_TYPES,
  validateSubject,
  isValidSubjectType,
  type SubjectType,
  type GovernedSubject,
  type SubjectValidationResult,
} from "./governed-subject";

// Pack Resolver
export {
  resolvePacks,
  hasTypePack,
  getAvailablePacks,
  type PackId,
  type PackResolution,
} from "./pack-resolver";

// Control Catalog
export {
  CONTROL_CATALOG,
  getActiveControls,
  getControlsForStage,
  getControlsByDomain,
  getControlsByPack,
  getControlById,
  getMaxScore,
  getRequiredRunnerIds,
  type ControlDefinition,
  type ControlDomain,
  type PackType,
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

// Drift Detector & Freeze Management
export {
  detectDrift,
  startDriftDetection,
  stopDriftDetection,
  getLastDriftReport,
  getDriftHistory,
  isDriftDetectionActive,
  getFrozenSubjects,
  unfreezeSubject,
  isFrozen,
  freezeSubject,
  getFreezeDetails,
  type DriftReport,
  type DriftConfig,
  type FrozenSubject,
} from "./drift-detector";
