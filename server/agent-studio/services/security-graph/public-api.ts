/**
 * Security Graph public-api barrel — Phase 25 §T-G.3.
 */

export {
  SECURITY_GRAPH_NODE_TYPES,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
  SECURITY_FINDING_SEVERITIES,
  SECURITY_FINDINGS_VIEW_PERMISSION_KEY,
  SECURITY_GRAPH_DEFAULT_PERMISSION_SCOPE,
  isSecurityGraphNodeType,
  getSecurityGraphNodeTypeMetadata,
  SECURITY_GRAPH_NODE_TYPE_METADATA,
  SECURITY_FINDING_SEVERITY_METADATA,
  getSecurityFindingSeverityMetadata,
  isSecurityFindingSeverity,
  cvssScoreToSeverity,
  severityRank,
  compareSecuritySeverity,
  sortBySeverityDesc,
  getMostSevereItem,
  summarizeSecurityFindings,
  isCanonicalImpactStep,
  getNextCanonicalImpactStep,
  getPreviousCanonicalImpactStep,
  getCanonicalImpactPathFromStep,
  getCanonicalImpactPathToStep,
  getCanonicalImpactSubPath,
  getCanonicalImpactDistance,
  validateImpactPathSequence,
  summarizeImpactPathValidationOutcomes,
  IMPACT_PATH_VALIDATION_REASON_KEYS,
  IMPACT_PATH_VALIDATION_REASON_METADATA,
  getImpactPathValidationReasonMetadata,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA,
  getSecurityGraphCanonicalPathStepMetadata,
  // T-G.3.1 — edge taxonomy
  SECURITY_GRAPH_EDGE_TYPES,
  SECURITY_GRAPH_EDGE_CONSTRAINTS,
  SECURITY_GRAPH_EDGE_TYPE_METADATA,
  isSecurityGraphEdgeType,
  validateSecurityGraphEdgeWithReason,
  validateSecurityGraphEdgeBatch,
  getSecurityGraphEdgeTypeMetadata,
  type SecurityGraphNodeType,
  type SecurityGraphCanonicalPathStep,
  type SecurityFindingSeverity,
  type SecurityFindingSummary,
  type CanonicalImpactPathValidationOutcome,
  type ImpactPathValidationReason,
  type ImpactPathValidationBatchSummary,
  type SecurityGraphNodeTypeMetadata,
  type SecurityFindingSeverityMetadata,
  type ImpactPathValidationReasonMetadata,
  type SecurityGraphCanonicalPathStepMetadata,
  // T-G.3.1 — edge taxonomy types
  type SecurityGraphEdgeType,
  type SecurityGraphEdgeConstraint,
  type SecurityGraphEdgeValidationReason,
  type SecurityGraphEdgeValidationOutcome,
  type SecurityGraphEdgeBatchInput,
  type SecurityGraphEdgeBatchResult,
  type SecurityGraphEdgeTypeMetadata,
} from "./contracts.js";

// T-G.3.1 — production sub-module barrels (cve-feed / persistence /
// projection). Each currently exports a `create*` factory that
// throws a tagged `[T-G.3.1]` placeholder; T-G.3.2 / .3 / .4 each
// flip exactly one factory to a real implementation.
export * from "./cve-feed/public-api.js";
export * from "./persistence/public-api.js";
export * from "./projection/public-api.js";
