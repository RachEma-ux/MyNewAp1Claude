/**
 * Control Catalog — Governance Bible CGT v2
 *
 * Canonical catalog of all governance controls with:
 *   - Stable control IDs (never reused)
 *   - Domain mapping
 *   - Severity classification
 *   - Stage gate mapping (when the control blocks)
 *   - Scoring weight (summed per domain)
 *   - Remediation text
 *
 * Control ID format: {DOMAIN}-{NNN}
 *   SEC  = Security
 *   ARCH = Architecture
 *   LIFE = Lifecycle
 *   GOV  = Governance / Compliance
 *   DOC  = Documentation
 */

import type { RiskSeverity, RiskCategory } from "../risk-classifier";
import type { LifecycleStage } from "../lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export type ControlDomain =
  | "security"
  | "architecture"
  | "lifecycle"
  | "governance"
  | "documentation";

export interface ControlDefinition {
  /** Stable control ID — never reused once assigned */
  id: string;
  /** Human-readable control name */
  name: string;
  /** Domain this control belongs to */
  domain: ControlDomain;
  /** Risk category for finding classification */
  riskCategory: RiskCategory;
  /** Severity when the control fails */
  severity: RiskSeverity;
  /** Lifecycle stages where this control blocks progression */
  blocksStages: LifecycleStage[];
  /** Weight for scoring (0–10). Higher = more impactful. */
  weight: number;
  /** Runner ID — links to the ControlRunner that evaluates this */
  runnerId: string;
  /** Human-readable remediation instructions */
  remediation: string;
  /** Whether this control is active */
  enabled: boolean;
}

// ============================================================================
// Control Catalog
// ============================================================================

export const CONTROL_CATALOG: ControlDefinition[] = [
  // ── Security Controls (SEC-xxx) ──────────────────────────────────────

  {
    id: "SEC-001",
    name: "No hardcoded secrets",
    domain: "security",
    riskCategory: "hardcoded_secret",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "secret-scanner",
    remediation:
      "Move all secrets to environment variables or a secret manager. Remove plaintext credentials from source code, config files, and YAML.",
    enabled: true,
  },
  {
    id: "SEC-002",
    name: "No dynamic eval execution",
    domain: "security",
    riskCategory: "dynamic_eval",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "eval-detector",
    remediation:
      "Replace eval(), new Function(), and setTimeout/setInterval with string arguments with safe alternatives. Use structured data parsing instead.",
    enabled: true,
  },
  {
    id: "SEC-003",
    name: "No debug mode in production",
    domain: "security",
    riskCategory: "debug_in_production",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "environment-validator",
    remediation:
      "Ensure DEBUG=true is not set in production. Remove verbose logging and debug endpoints before deployment.",
    enabled: true,
  },
  {
    id: "SEC-004",
    name: "Secrets externalized",
    domain: "security",
    riskCategory: "missing_encryption",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "secret-externalization-validator",
    remediation:
      "All credentials must come from environment variables, secret manager, or encrypted config. No inline keys in source.",
    enabled: true,
  },
  {
    id: "SEC-005",
    name: "No silent privilege escalation",
    domain: "security",
    riskCategory: "silent_escalation",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "escalation-detector",
    remediation:
      "All role changes must go through RBAC enforcement. No direct role assignment without governance engine validation.",
    enabled: true,
  },

  // ── Architecture Controls (ARCH-xxx) ─────────────────────────────────

  {
    id: "ARCH-001",
    name: "No direct provider invocation",
    domain: "architecture",
    riskCategory: "direct_provider_call",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "provider-call-detector",
    remediation:
      "All provider calls must go through the orchestrator layer. Agents and workflows must not import provider implementations directly.",
    enabled: true,
  },
  {
    id: "ARCH-002",
    name: "Architecture layer isolation",
    domain: "architecture",
    riskCategory: "architecture_drift",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 6,
    runnerId: "architecture-boundary-validator",
    remediation:
      "Ensure layer boundaries are respected: UI -> Orchestrator -> Agent/Workflow -> Provider. No cross-layer imports.",
    enabled: true,
  },
  {
    id: "ARCH-003",
    name: "Policy engine available",
    domain: "architecture",
    riskCategory: "policy_bypass",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "policy-engine-validator",
    remediation:
      "Ensure OPA_URL is configured or local policy engine is operational. Policy enforcement must be active.",
    enabled: true,
  },
  {
    id: "ARCH-004",
    name: "Orchestrator mandatory for multi-agent",
    domain: "architecture",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "orchestrator-validator",
    remediation:
      "Multi-agent tasks must route through the orchestrator. Direct agent-to-agent calls are prohibited.",
    enabled: true,
  },

  // ── Lifecycle Controls (LIFE-xxx) ────────────────────────────────────

  {
    id: "LIFE-001",
    name: "No stage skipping",
    domain: "lifecycle",
    riskCategory: "lifecycle_skip",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "lifecycle-sequence-validator",
    remediation:
      "Entries must follow Submit -> Register -> Validate -> Publish -> Catalog. No stage may be skipped.",
    enabled: true,
  },
  {
    id: "LIFE-002",
    name: "Manual approval required",
    domain: "lifecycle",
    riskCategory: "lifecycle_skip",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "approval-validator",
    remediation:
      "Automatic promotion is prohibited. Each lifecycle transition requires explicit human approval with actor ID recorded.",
    enabled: true,
  },
  {
    id: "LIFE-003",
    name: "Separation of duty enforced",
    domain: "lifecycle",
    riskCategory: "silent_escalation",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "separation-of-duty-validator",
    remediation:
      "The actor who submits an entry must not be the same actor who validates or publishes it. Different roles required.",
    enabled: true,
  },
  {
    id: "LIFE-004",
    name: "Publication gate triple validation",
    domain: "lifecycle",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["publish"],
    weight: 10,
    runnerId: "publication-gate-validator",
    remediation:
      "Publication requires: (1) Compliance Matrix PASS, (2) YAML Enforcement Spec PASS, (3) Admin Checklist COMPLETE, (4) No Critical/High violations.",
    enabled: true,
  },

  // ── Governance / Compliance Controls (GOV-xxx) ───────────────────────

  {
    id: "GOV-001",
    name: "Deny-by-default enforced",
    domain: "governance",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "deny-default-validator",
    remediation:
      "Policy gate must operate in deny-by-default mode. In production, fail-closed is mandatory. No implicit allow.",
    enabled: true,
  },
  {
    id: "GOV-002",
    name: "RBAC enforcement active",
    domain: "governance",
    riskCategory: "missing_rbac",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "rbac-enforcement-validator",
    remediation:
      "Role-based access control must be active on all tRPC procedures. Every sensitive action must check permissions.",
    enabled: true,
  },
  {
    id: "GOV-003",
    name: "Audit logging operational",
    domain: "governance",
    riskCategory: "missing_audit",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "audit-logging-validator",
    remediation:
      "Governance audit logger and unified audit logger must both be operational. All decisions must be logged.",
    enabled: true,
  },
  {
    id: "GOV-004",
    name: "Policy file integrity",
    domain: "governance",
    riskCategory: "missing_policy_mapping",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 5,
    runnerId: "policy-file-validator",
    remediation:
      "OPA .rego policy files must be syntactically valid and present in the expected location. Policy mapping must be complete.",
    enabled: true,
  },
  {
    id: "GOV-005",
    name: "No policy bypass",
    domain: "governance",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "policy-bypass-detector",
    remediation:
      "No code path may skip policy evaluation. All sensitive operations must call evaluatePolicy() or enforcePolicyOrThrow().",
    enabled: true,
  },

  // ── Documentation Controls (DOC-xxx) ─────────────────────────────────

  {
    id: "DOC-001",
    name: "Governance documentation present",
    domain: "documentation",
    riskCategory: "incomplete_documentation",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 4,
    runnerId: "governance-docs-validator",
    remediation:
      "GOVERNANCE_BIBLE.md and ARCHITECTURE.md must exist in the repository. Keep them current with latest governance standard.",
    enabled: true,
  },
  {
    id: "DOC-002",
    name: "Entry documentation complete",
    domain: "documentation",
    riskCategory: "incomplete_documentation",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 4,
    runnerId: "entry-docs-validator",
    remediation:
      "Each catalog entry must have a name, type, and description before publication. Missing fields block the Publish stage.",
    enabled: true,
  },
  {
    id: "DOC-003",
    name: "Undocumented endpoints absent",
    domain: "documentation",
    riskCategory: "undocumented_endpoint",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 6,
    runnerId: "endpoint-docs-validator",
    remediation:
      "All API endpoints must be documented in routers or have JSDoc comments. Undocumented endpoints create security blind spots.",
    enabled: true,
  },
];

// ============================================================================
// Catalog Helpers
// ============================================================================

/** Get all enabled controls */
export function getActiveControls(): ControlDefinition[] {
  return CONTROL_CATALOG.filter((c) => c.enabled);
}

/** Get controls that block a specific stage */
export function getControlsForStage(stage: LifecycleStage): ControlDefinition[] {
  return getActiveControls().filter((c) => c.blocksStages.includes(stage));
}

/** Get controls by domain */
export function getControlsByDomain(domain: ControlDomain): ControlDefinition[] {
  return getActiveControls().filter((c) => c.domain === domain);
}

/** Get a control by ID */
export function getControlById(id: string): ControlDefinition | undefined {
  return CONTROL_CATALOG.find((c) => c.id === id);
}

/** Get maximum possible score (sum of all active weights) */
export function getMaxScore(): number {
  return getActiveControls().reduce((sum, c) => sum + c.weight, 0);
}

/** Get all unique runner IDs needed */
export function getRequiredRunnerIds(): string[] {
  return [...new Set(getActiveControls().map((c) => c.runnerId))];
}
