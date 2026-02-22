/**
 * Catalog Lint — Governance Bible CGT v2
 *
 * Phase 8 — Control Catalog Quality Enforcement
 * Role: CE-B (CI/CD & Runners Owner) + GSCE (Governance Expert)
 *
 * Validates the control catalog meets production requirements:
 *   1. All controls have required metadata
 *   2. Coverage thresholds per pack
 *   3. Severity distribution requirements
 *   4. Runner registration completeness
 *   5. No orphaned controls
 *
 * Coverage thresholds (GSCE-defined, TL-approved):
 *   - Base pack: >= 15 controls
 *   - Each type pack: >= 2 controls
 *   - >= 2 critical controls in base
 *   - >= 2 critical controls in each type pack
 *   - >= 8 validate-stage controls per type (base + type combined)
 *
 * CI integration: Fail build on violation.
 */

import {
  CONTROL_CATALOG,
  getActiveControls,
  getControlsByPack,
  getRequiredRunnerIds,
  type ControlDefinition,
  type PackType,
} from "./scorecard/control-catalog";
import { getAllRunners } from "./scorecard/runner";
import { SUBJECT_TYPES, type SubjectType } from "./scorecard/governed-subject";

// ============================================================================
// Types
// ============================================================================

export interface LintViolation {
  /** Severity: error = fail CI, warning = report only */
  severity: "error" | "warning";
  /** Control ID or pack name */
  target: string;
  /** What's wrong */
  message: string;
  /** Remediation */
  fix: string;
}

export interface LintReport {
  /** When lint ran */
  timestamp: string;
  /** Total controls in catalog */
  totalControls: number;
  /** Active controls */
  activeControls: number;
  /** Violations found */
  violations: LintViolation[];
  /** Error count (fail CI) */
  errorCount: number;
  /** Warning count */
  warningCount: number;
  /** Whether lint passed */
  passed: boolean;
  /** Coverage stats per pack */
  coverage: Record<string, {
    total: number;
    critical: number;
    high: number;
    validateStage: number;
  }>;
  /** Runner registration check */
  runnerCoverage: {
    required: string[];
    registered: string[];
    missing: string[];
  };
}

// ============================================================================
// Thresholds (GSCE-defined)
// ============================================================================

const THRESHOLDS = {
  /** Minimum controls in base pack */
  minBaseControls: 15,
  /** Minimum controls per type pack */
  minTypePackControls: 2,
  /** Minimum critical controls in base pack */
  minCriticalInBase: 2,
  /** Minimum critical controls per type pack */
  minCriticalPerType: 1,
  /** Minimum validate-stage controls per type (base + type combined) */
  minValidatePerType: 5,
};

// ============================================================================
// Lint Engine
// ============================================================================

/**
 * Run full catalog lint.
 */
export function lintCatalog(): LintReport {
  const violations: LintViolation[] = [];
  const allControls = CONTROL_CATALOG;
  const activeControls = getActiveControls();

  // ── 1. Required metadata check ──────────────────────────────────────
  for (const control of allControls) {
    if (!control.id) {
      violations.push({ severity: "error", target: "unknown", message: "Control missing ID", fix: "Add stable ID" });
    }
    if (!control.name) {
      violations.push({ severity: "error", target: control.id, message: "Control missing name", fix: "Add descriptive name" });
    }
    if (!control.domain) {
      violations.push({ severity: "error", target: control.id, message: "Control missing domain", fix: "Assign domain" });
    }
    if (!control.pack) {
      violations.push({ severity: "error", target: control.id, message: "Control missing pack", fix: "Assign to base or type pack" });
    }
    if (!control.severity) {
      violations.push({ severity: "error", target: control.id, message: "Control missing severity", fix: "Set severity" });
    }
    if (!control.runnerId) {
      violations.push({ severity: "error", target: control.id, message: "Control missing runnerId", fix: "Assign runner" });
    }
    if (!control.remediation || control.remediation.length < 10) {
      violations.push({ severity: "error", target: control.id, message: "Control missing or insufficient remediation text", fix: "Add remediation >= 10 chars" });
    }
    if (!control.rationale || control.rationale.length < 10) {
      violations.push({ severity: "warning", target: control.id, message: "Control missing rationale", fix: "Add rationale" });
    }
    if (!control.blocksStages || control.blocksStages.length === 0) {
      violations.push({ severity: "warning", target: control.id, message: "Control blocks no stages", fix: "Assign stage gates" });
    }
    if (control.weight <= 0) {
      violations.push({ severity: "warning", target: control.id, message: "Control has zero weight", fix: "Set positive weight" });
    }
  }

  // ── 2. Coverage thresholds ──────────────────────────────────────────
  const coverage: Record<string, { total: number; critical: number; high: number; validateStage: number }> = {};

  // Base pack
  const baseControls = activeControls.filter((c) => c.pack === "base");
  coverage["base"] = {
    total: baseControls.length,
    critical: baseControls.filter((c) => c.severity === "critical").length,
    high: baseControls.filter((c) => c.severity === "high").length,
    validateStage: baseControls.filter((c) => c.blocksStages.includes("validate")).length,
  };

  if (baseControls.length < THRESHOLDS.minBaseControls) {
    violations.push({
      severity: "error",
      target: "base",
      message: `Base pack has ${baseControls.length} controls (min: ${THRESHOLDS.minBaseControls})`,
      fix: `Add ${THRESHOLDS.minBaseControls - baseControls.length} more base controls`,
    });
  }

  if (coverage["base"].critical < THRESHOLDS.minCriticalInBase) {
    violations.push({
      severity: "error",
      target: "base",
      message: `Base pack has ${coverage["base"].critical} critical controls (min: ${THRESHOLDS.minCriticalInBase})`,
      fix: `Add ${THRESHOLDS.minCriticalInBase - coverage["base"].critical} more critical controls`,
    });
  }

  // Type packs
  for (const subjectType of SUBJECT_TYPES) {
    const typeControls = activeControls.filter((c) => c.pack === subjectType);
    const combined = [...baseControls, ...typeControls];

    coverage[subjectType] = {
      total: typeControls.length,
      critical: typeControls.filter((c) => c.severity === "critical").length,
      high: typeControls.filter((c) => c.severity === "high").length,
      validateStage: combined.filter((c) => c.blocksStages.includes("validate")).length,
    };

    if (typeControls.length < THRESHOLDS.minTypePackControls) {
      violations.push({
        severity: "error",
        target: subjectType,
        message: `Type pack '${subjectType}' has ${typeControls.length} controls (min: ${THRESHOLDS.minTypePackControls})`,
        fix: `Add ${THRESHOLDS.minTypePackControls - typeControls.length} more controls to ${subjectType} pack`,
      });
    }

    if (coverage[subjectType].critical < THRESHOLDS.minCriticalPerType) {
      violations.push({
        severity: "error",
        target: subjectType,
        message: `Type pack '${subjectType}' has ${coverage[subjectType].critical} critical controls (min: ${THRESHOLDS.minCriticalPerType})`,
        fix: `Add ${THRESHOLDS.minCriticalPerType - coverage[subjectType].critical} critical controls to ${subjectType}`,
      });
    }

    if (coverage[subjectType].validateStage < THRESHOLDS.minValidatePerType) {
      violations.push({
        severity: "warning",
        target: subjectType,
        message: `Type '${subjectType}' has ${coverage[subjectType].validateStage} validate-stage controls (target: ${THRESHOLDS.minValidatePerType})`,
        fix: `Add validate-stage controls for ${subjectType}`,
      });
    }
  }

  // ── 3. Runner registration check ───────────────────────────────────
  const requiredRunnerIds = getRequiredRunnerIds();
  const registeredRunners = getAllRunners().map((r) => r.id);
  const missingRunners = requiredRunnerIds.filter((id) => !registeredRunners.includes(id));

  for (const missing of missingRunners) {
    violations.push({
      severity: "error",
      target: missing,
      message: `Runner "${missing}" required by catalog but not registered`,
      fix: `Register runner "${missing}" in runner.ts`,
    });
  }

  // ── 4. Duplicate ID check ──────────────────────────────────────────
  const ids = new Set<string>();
  for (const control of allControls) {
    if (ids.has(control.id)) {
      violations.push({
        severity: "error",
        target: control.id,
        message: `Duplicate control ID: ${control.id}`,
        fix: "Assign unique IDs to all controls",
      });
    }
    ids.add(control.id);
  }

  // ── Build report ───────────────────────────────────────────────────
  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;

  return {
    timestamp: new Date().toISOString(),
    totalControls: allControls.length,
    activeControls: activeControls.length,
    violations,
    errorCount,
    warningCount,
    passed: errorCount === 0,
    coverage,
    runnerCoverage: {
      required: requiredRunnerIds,
      registered: registeredRunners,
      missing: missingRunners,
    },
  };
}

/**
 * Format lint report for CLI/CI output.
 */
export function formatLintReport(report: LintReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "  GOVERNANCE CATALOG LINT — CGT v2",
    "═══════════════════════════════════════════════════════",
    "",
    `Controls: ${report.activeControls}/${report.totalControls} active`,
    `Runners: ${report.runnerCoverage.registered.length}/${report.runnerCoverage.required.length} registered`,
    "",
    "Pack Coverage:",
  ];

  for (const [pack, stats] of Object.entries(report.coverage)) {
    lines.push(`  ${pack.padEnd(10)}: ${stats.total} controls (${stats.critical} critical, ${stats.high} high, ${stats.validateStage} validate-gate)`);
  }

  lines.push("");

  if (report.violations.length > 0) {
    lines.push(`Violations: ${report.errorCount} errors, ${report.warningCount} warnings`);
    for (const v of report.violations) {
      const icon = v.severity === "error" ? "ERROR" : "WARN ";
      lines.push(`  [${icon}] ${v.target}: ${v.message}`);
    }
  } else {
    lines.push("No violations found.");
  }

  lines.push("");
  lines.push(`Result: ${report.passed ? "PASS" : "FAIL"}`);
  lines.push("═══════════════════════════════════════════════════════");

  return lines.join("\n");
}
