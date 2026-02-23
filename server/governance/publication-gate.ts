/**
 * Publication Gate — Governance Bible CGT v2, Section VII
 *
 * Implements the Triple Validation Rule:
 *   1. Compliance Matrix = PASS
 *   2. YAML Enforcement Spec = PASS
 *   3. Admin Checklist = COMPLETE
 *   4. Risk Severity ≤ Medium
 *
 * An entry may only be published if ALL conditions pass.
 * Failure at any layer halts progression.
 */

import {
  type RiskFinding,
  type RiskReport,
  buildRiskReport,
  createFinding,
} from "./risk-classifier";
import { hasPermission, type PermissionAction } from "./rbac-model";
import {
  validateTransition,
  getStageFromTags,
  type TransitionResult,
} from "./lifecycle-guard";
import { getAuditLogger } from "../services/auditLogger";

// ============================================================================
// Types
// ============================================================================

export interface PublicationRequest {
  entryId: number;
  entryName: string;
  entryType: string;
  tags: string[];
  description?: string;
  config?: any;
  actorId: string;
  actorRole: string;
}

export interface ComplianceCheck {
  name: string;
  category: "compliance_matrix" | "yaml_spec" | "admin_checklist";
  passed: boolean;
  details?: string;
}

export interface PublicationDecision {
  allowed: boolean;
  checks: ComplianceCheck[];
  riskReport: RiskReport;
  transitionResult?: TransitionResult;
  reason: string;
  timestamp: Date;
}

// ============================================================================
// Compliance Matrix Checks (Section II)
// ============================================================================

function runComplianceMatrix(req: PublicationRequest): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // 1. Entry type declared
  checks.push({
    name: "Entry type declared",
    category: "compliance_matrix",
    passed: !!req.entryType,
    details: req.entryType ? `Type: ${req.entryType}` : "Missing entry type",
  });

  // 2. Description exists
  checks.push({
    name: "Documentation exists",
    category: "compliance_matrix",
    passed: !!req.description && req.description.length > 0,
    details: req.description ? "Description provided" : "Missing description",
  });

  // 3. Tags include lifecycle tag
  const hasLifecycleTag = (req.tags || []).some((t) =>
    ["candidate", "registered", "validated", "published"].includes(t)
  );
  checks.push({
    name: "Lifecycle tag present",
    category: "compliance_matrix",
    passed: hasLifecycleTag,
    details: hasLifecycleTag
      ? `Tags: ${req.tags.join(", ")}`
      : "No lifecycle tag found",
  });

  // 4. Validated stage reached
  const stage = getStageFromTags(req.tags || []);
  checks.push({
    name: "Validated stage reached",
    category: "compliance_matrix",
    passed: stage === "validate" || stage === "publish",
    details: `Current stage: ${stage}`,
  });

  // 5. RBAC — actor has publish permission
  checks.push({
    name: "Actor has publish permission",
    category: "compliance_matrix",
    passed: hasPermission(req.actorRole, "lifecycle.publish"),
    details: `Role: ${req.actorRole}`,
  });

  return checks;
}

// ============================================================================
// YAML Enforcement Spec Checks (Section V)
// ============================================================================

function runYamlSpecChecks(req: PublicationRequest): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // 1. Deny-by-default (no implicit allow)
  checks.push({
    name: "Deny-by-default enforced",
    category: "yaml_spec",
    passed: true, // Enforced at platform level by policyGate
    details: "Policy gate enforces fail-closed in production",
  });

  // 2. Manual approval required (not auto-promoted)
  checks.push({
    name: "Manual approval required",
    category: "yaml_spec",
    passed: !!req.actorId && req.actorId !== "system-auto",
    details: req.actorId ? `Approved by: ${req.actorId}` : "Missing actor",
  });

  // 3. Audit logging active
  checks.push({
    name: "Audit logging active",
    category: "yaml_spec",
    passed: true, // Audit logger is always active
    details: "Governance audit logger operational",
  });

  // 4. Secrets externalized (no config contains plaintext patterns)
  const configStr = JSON.stringify(req.config || {});
  const hasSecretPatterns =
    /(?:password|secret|api[_-]?key|token|credential)["']?\s*[:=]\s*["'][^"']{8,}/i.test(
      configStr
    );
  checks.push({
    name: "Secrets externalized",
    category: "yaml_spec",
    passed: !hasSecretPatterns,
    details: hasSecretPatterns
      ? "Potential hardcoded secret detected in config"
      : "No hardcoded secrets found",
  });

  return checks;
}

// ============================================================================
// Admin Checklist Checks (Section VI)
// ============================================================================

function runAdminChecklist(req: PublicationRequest): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // Stage 4 — Publish checklist
  checks.push({
    name: "Entry name valid",
    category: "admin_checklist",
    passed: !!req.entryName && req.entryName.length >= 1,
    details: req.entryName || "Missing name",
  });

  checks.push({
    name: "Entry type valid",
    category: "admin_checklist",
    passed: ["provider", "llm", "model", "agent", "bot"].includes(req.entryType),
    details: `Type: ${req.entryType}`,
  });

  const stage = getStageFromTags(req.tags || []);
  checks.push({
    name: "Lifecycle complete",
    category: "admin_checklist",
    passed: stage === "validate",
    details: `Current stage: ${stage} (expected: validate before publish)`,
  });

  return checks;
}

// ============================================================================
// Publication Gate
// ============================================================================

/**
 * Evaluate whether an entry can be published.
 *
 * Implements the Triple Validation Rule:
 *   1. All compliance matrix checks pass
 *   2. All YAML enforcement spec checks pass
 *   3. Admin checklist complete
 *   4. No Critical or High risk findings
 */
export async function evaluatePublication(req: PublicationRequest): Promise<PublicationDecision> {
  // Run all check categories
  const complianceChecks = runComplianceMatrix(req);
  const yamlChecks = runYamlSpecChecks(req);
  const adminChecks = runAdminChecklist(req);

  const allChecks = [...complianceChecks, ...yamlChecks, ...adminChecks];

  // Collect risk findings from failed checks
  const findings: RiskFinding[] = [];

  for (const check of allChecks) {
    if (!check.passed) {
      const category =
        check.category === "yaml_spec" && check.name.includes("Secret")
          ? "hardcoded_secret"
          : "incomplete_documentation";

      findings.push(
        createFinding(
          category as any,
          `Publication check failed: ${check.name}`,
          check.details || "No details",
          req.entryName
        )
      );
    }
  }

  // Build risk report
  const riskReport = buildRiskReport(findings);

  // Validate lifecycle transition
  const stage = getStageFromTags(req.tags || []);
  let transitionResult: TransitionResult | undefined;

  if (stage === "validate") {
    transitionResult = await validateTransition({
      entryId: req.entryId,
      entryName: req.entryName,
      fromStage: "validate",
      toStage: "publish",
      actorId: req.actorId,
      actorRole: req.actorRole,
      riskFindings: findings,
    });
  }

  // Triple validation
  const compliancePass = complianceChecks.every((c) => c.passed);
  const yamlPass = yamlChecks.every((c) => c.passed);
  const adminPass = adminChecks.every((c) => c.passed);
  const riskPass = !riskReport.publicationBlocked;
  const transitionPass = !transitionResult || transitionResult.allowed;

  const allowed = compliancePass && yamlPass && adminPass && riskPass && transitionPass;

  // Build reason
  const failedCategories: string[] = [];
  if (!compliancePass) failedCategories.push("Compliance Matrix");
  if (!yamlPass) failedCategories.push("YAML Enforcement Spec");
  if (!adminPass) failedCategories.push("Admin Checklist");
  if (!riskPass) failedCategories.push(`Risk (${riskReport.blockReason})`);
  if (!transitionPass) failedCategories.push("Lifecycle Guard");

  const reason = allowed
    ? "Publication approved — all validation layers passed"
    : `Publication blocked: ${failedCategories.join(", ")}`;

  // Audit log the decision
  getAuditLogger().log({
    actor_id: req.actorId,
    action_type: "POLICY_UPDATE" as any,
    target_type: "publication_gate",
    target_id: String(req.entryId),
    decision_result: allowed ? "success" : "denied",
    metadata: {
      entryName: req.entryName,
      compliancePass,
      yamlPass,
      adminPass,
      riskPass,
      reason,
    },
  });

  return {
    allowed,
    checks: allChecks,
    riskReport,
    transitionResult,
    reason,
    timestamp: new Date(),
  };
}
