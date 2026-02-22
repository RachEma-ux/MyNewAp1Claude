/**
 * Risk Classification Matrix — Governance Bible CGT v2, Section IV
 *
 * Classifies governance violations by severity and determines
 * whether lifecycle progression should be blocked.
 *
 * Severity levels:
 *   Critical → Immediate rejection
 *   High     → Block Validate
 *   Medium   → Block Publish
 *   Low      → Fix before merge (advisory)
 */

// ============================================================================
// Types
// ============================================================================

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskFinding {
  id: string;
  severity: RiskSeverity;
  category: RiskCategory;
  title: string;
  description: string;
  target?: string;
  evidence?: string;
  detectedAt: Date;
}

export type RiskCategory =
  | "policy_bypass"
  | "hardcoded_secret"
  | "lifecycle_skip"
  | "direct_provider_call"
  | "missing_enforcement_hook"
  | "undocumented_endpoint"
  | "missing_rbac"
  | "incomplete_documentation"
  | "missing_policy_mapping"
  | "dynamic_eval"
  | "silent_escalation"
  | "missing_audit"
  | "debug_in_production"
  | "missing_encryption"
  | "architecture_drift"
  | "formatting";

export interface RiskReport {
  timestamp: Date;
  findings: RiskFinding[];
  summary: RiskSummary;
  publicationBlocked: boolean;
  blockReason?: string;
}

export interface RiskSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// ============================================================================
// Severity Rules
// ============================================================================

const CATEGORY_SEVERITY: Record<RiskCategory, RiskSeverity> = {
  policy_bypass: "critical",
  hardcoded_secret: "critical",
  lifecycle_skip: "critical",
  direct_provider_call: "critical",
  dynamic_eval: "critical",
  silent_escalation: "critical",
  missing_enforcement_hook: "high",
  undocumented_endpoint: "high",
  missing_rbac: "high",
  missing_audit: "high",
  debug_in_production: "high",
  missing_encryption: "high",
  incomplete_documentation: "medium",
  missing_policy_mapping: "medium",
  architecture_drift: "medium",
  formatting: "low",
};

// ============================================================================
// Risk Classifier
// ============================================================================

let findingCounter = 0;

/**
 * Create a risk finding with auto-classified severity
 */
export function createFinding(
  category: RiskCategory,
  title: string,
  description: string,
  target?: string,
  evidence?: string
): RiskFinding {
  findingCounter++;
  return {
    id: `RF-${findingCounter.toString().padStart(4, "0")}`,
    severity: CATEGORY_SEVERITY[category],
    category,
    title,
    description,
    target,
    evidence,
    detectedAt: new Date(),
  };
}

/**
 * Build a risk report from findings
 */
export function buildRiskReport(findings: RiskFinding[]): RiskReport {
  const summary: RiskSummary = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  const publicationBlocked = summary.critical > 0 || summary.high > 0;
  const blockReason = publicationBlocked
    ? `${summary.critical} Critical and ${summary.high} High findings block lifecycle progression`
    : undefined;

  return {
    timestamp: new Date(),
    findings,
    summary,
    publicationBlocked,
    blockReason,
  };
}

/**
 * Check if a severity level blocks at a given lifecycle stage
 */
export function blocksStage(
  severity: RiskSeverity,
  stage: "register" | "validate" | "publish" | "catalog"
): boolean {
  switch (severity) {
    case "critical":
      return true; // Blocks all stages
    case "high":
      return stage === "validate" || stage === "publish" || stage === "catalog";
    case "medium":
      return stage === "publish" || stage === "catalog";
    case "low":
      return false; // Advisory only
  }
}

/**
 * Get human-readable action for a severity
 */
export function getSeverityAction(severity: RiskSeverity): string {
  switch (severity) {
    case "critical":
      return "Immediate rejection — cannot proceed";
    case "high":
      return "Block Validate — must resolve before validation";
    case "medium":
      return "Block Publish — must resolve before publication";
    case "low":
      return "Fix before merge — advisory";
  }
}

/**
 * Compare two severities. Returns negative if a is more severe.
 */
export function compareSeverity(a: RiskSeverity, b: RiskSeverity): number {
  const order: Record<RiskSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return order[a] - order[b];
}

/**
 * Get the highest severity from a list of findings
 */
export function getHighestSeverity(findings: RiskFinding[]): RiskSeverity | null {
  if (findings.length === 0) return null;
  return findings.reduce((highest, f) =>
    compareSeverity(f.severity, highest) < 0 ? f.severity : highest,
    findings[0].severity
  );
}
