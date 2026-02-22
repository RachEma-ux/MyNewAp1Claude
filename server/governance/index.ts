/**
 * Governance Module — Governance Bible CGT v2
 *
 * Public API for the governance enforcement layer.
 *
 * Subsystems:
 *   - governance-engine: Central enforcement engine
 *   - rbac-model: Extended role-based access control
 *   - risk-classifier: Risk severity classification
 *   - lifecycle-guard: Lifecycle stage transition enforcement
 *   - publication-gate: Triple validation publication gate
 *   - architecture-validator: Architecture boundary validation
 *   - self-check: Runtime governance health check
 *   - router: tRPC API endpoints
 */

export { getGovernanceEngine, initializeGovernance } from "./governance-engine";
export {
  hasPermission,
  getPermissions,
  normalizeRole,
  isValidRole,
  checkSeparationOfDuty,
  GOVERNANCE_ROLES,
  PERMISSION_ACTIONS,
  type GovernanceRole,
  type PermissionAction,
} from "./rbac-model";
export {
  createFinding,
  buildRiskReport,
  blocksStage,
  getSeverityAction,
  compareSeverity,
  getHighestSeverity,
  type RiskSeverity,
  type RiskFinding,
  type RiskReport,
  type RiskCategory,
} from "./risk-classifier";
export {
  validateTransition,
  getStageFromTags,
  getTagForStage,
  getNextStage,
  canTransitionFromTags,
  validateStageRequirements,
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type TransitionRequest,
  type TransitionResult,
} from "./lifecycle-guard";
export {
  evaluatePublication,
  type PublicationRequest,
  type PublicationDecision,
} from "./publication-gate";
export {
  validateArchitecture,
  validateStartupConditions,
  isInvocationAllowed,
  validateInvocationChain,
  ARCHITECTURE_LAYERS,
  type ArchitectureLayer,
  type ArchitectureStatus,
} from "./architecture-validator";
export {
  runSelfCheck,
  type GovernanceSelfCheckReport,
} from "./self-check";
export { governanceRouter } from "./router";

// Scorecard Engine (CGT v2)
export {
  runScorecard,
  getLatestScorecard,
  getScorecardHistory,
  CONTROL_CATALOG,
  getActiveControls,
  getControlsForStage,
  getControlsByDomain,
  getControlById,
  getAllRunners,
  verifyBundleIntegrity,
  formatBundleSummary,
  detectDrift,
  startDriftDetection,
  stopDriftDetection,
  isDriftDetectionActive,
  type ScorecardRequest,
  type ScorecardResult,
  type ControlDefinition,
  type ControlDomain,
  type ControlResult,
  type EvidenceBundle,
  type DriftReport,
} from "./scorecard";
