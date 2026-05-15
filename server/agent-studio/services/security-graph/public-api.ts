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
  isSecurityFindingSeverity,
  cvssScoreToSeverity,
  severityRank,
  compareSecuritySeverity,
  sortBySeverityDesc,
  getMostSevereItem,
  isCanonicalImpactStep,
  getNextCanonicalImpactStep,
  getPreviousCanonicalImpactStep,
  getCanonicalImpactPathFromStep,
  validateImpactPathSequence,
  type SecurityGraphNodeType,
  type SecurityGraphCanonicalPathStep,
  type SecurityFindingSeverity,
  type CanonicalImpactPathValidationOutcome,
} from "./contracts.js";
