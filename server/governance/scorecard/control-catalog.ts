/**
 * Control Catalog — Governance Bible CGT v2
 *
 * Role: GSCE (Governance, Security & Compliance Expert)
 * Phase: 1 — Canonical Control Definitions
 *
 * Controls are organized into PACKS:
 *   - "base"     — applies to ALL subject types (mandatory)
 *   - "provider"  — provider-specific controls
 *   - "llm"       — LLM-specific controls
 *   - "model"     — model-specific controls
 *   - "agent"     — agent-specific controls
 *   - "bot"       — bot-specific controls
 *
 * Control ID format: {DOMAIN}-{NNN}
 *   SEC  = Security         ARCH = Architecture
 *   LIFE = Lifecycle        GOV  = Governance / Compliance
 *   DOC  = Documentation    TYPE = Type-specific
 *
 * Each control has:
 *   - Stable ID (never reused)
 *   - Pack assignment
 *   - Severity + stage gate + weight
 *   - Runner ID
 *   - Remediation text
 *   - Rationale
 */

import type { RiskSeverity, RiskCategory } from "../risk-classifier";
import type { LifecycleStage } from "../lifecycle-guard";
import type { SubjectType } from "./governed-subject";

// ============================================================================
// Types
// ============================================================================

export type ControlDomain =
  | "security"
  | "architecture"
  | "lifecycle"
  | "governance"
  | "documentation"
  | "type_specific";

export type PackType = "base" | SubjectType;

export interface ControlDefinition {
  /** Stable control ID — never reused once assigned */
  id: string;
  /** Human-readable control name */
  name: string;
  /** Domain this control belongs to */
  domain: ControlDomain;
  /** Pack this control belongs to: "base" or a SubjectType */
  pack: PackType;
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
  /** Rationale: why this control exists */
  rationale: string;
  /** Whether this control is active */
  enabled: boolean;
}

// ============================================================================
// BASE PACK — applies to ALL subject types
// ============================================================================

const BASE_CONTROLS: ControlDefinition[] = [
  // ── Security (SEC-xxx) ─────────────────────────────────────────────
  {
    id: "SEC-001",
    name: "No hardcoded secrets",
    domain: "security",
    pack: "base",
    riskCategory: "hardcoded_secret",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "secret-scanner",
    remediation: "Move all secrets to environment variables or a secret manager. Remove plaintext credentials from source code, config files, and YAML.",
    rationale: "Hardcoded secrets are the #1 source of credential leaks. CGT v2 Section IV mandates externalization.",
    enabled: true,
  },
  {
    id: "SEC-002",
    name: "No dynamic eval execution",
    domain: "security",
    pack: "base",
    riskCategory: "dynamic_eval",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "eval-detector",
    remediation: "Replace eval(), new Function(), and setTimeout/setInterval with string arguments with safe alternatives.",
    rationale: "Dynamic code execution enables arbitrary code injection. CGT v2 classifies this as Critical.",
    enabled: true,
  },
  {
    id: "SEC-003",
    name: "No debug mode in production",
    domain: "security",
    pack: "base",
    riskCategory: "debug_in_production",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "environment-validator",
    remediation: "Ensure DEBUG=true is not set in production. Remove verbose logging and debug endpoints before deployment.",
    rationale: "Debug mode exposes internal state. CGT v2 Section III requires production hardening.",
    enabled: true,
  },
  {
    id: "SEC-004",
    name: "Secrets externalized",
    domain: "security",
    pack: "base",
    riskCategory: "missing_encryption",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "secret-externalization-validator",
    remediation: "All credentials must come from environment variables, secret manager, or encrypted config.",
    rationale: "CGT v2 Section IV: no inline keys in source, runtime, or config.",
    enabled: true,
  },
  {
    id: "SEC-005",
    name: "No silent privilege escalation",
    domain: "security",
    pack: "base",
    riskCategory: "silent_escalation",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "escalation-detector",
    remediation: "All role changes must go through RBAC enforcement. No direct role assignment without governance engine validation.",
    rationale: "CGT v2 Section V: silent escalation is a Critical finding.",
    enabled: true,
  },

  // ── Architecture (ARCH-xxx) ────────────────────────────────────────
  {
    id: "ARCH-001",
    name: "No direct provider invocation",
    domain: "architecture",
    pack: "base",
    riskCategory: "direct_provider_call",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "provider-call-detector",
    remediation: "All provider calls must go through the orchestrator layer. Agents and workflows must not import provider implementations directly.",
    rationale: "CGT v2 Section III-D: orchestrator boundary is mandatory for auditability and policy enforcement.",
    enabled: true,
  },
  {
    id: "ARCH-002",
    name: "Architecture layer isolation",
    domain: "architecture",
    pack: "base",
    riskCategory: "architecture_drift",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 6,
    runnerId: "architecture-boundary-validator",
    remediation: "Ensure layer boundaries are respected: UI -> Orchestrator -> Agent/Workflow -> Provider.",
    rationale: "CGT v2 Section III: layer isolation prevents unauthorized data flow.",
    enabled: true,
  },
  {
    id: "ARCH-003",
    name: "Policy engine available",
    domain: "architecture",
    pack: "base",
    riskCategory: "policy_bypass",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "policy-engine-validator",
    remediation: "Ensure OPA_URL is configured or local policy engine is operational.",
    rationale: "CGT v2 Section II: policy enforcement is mandatory infrastructure.",
    enabled: true,
  },
  {
    id: "ARCH-004",
    name: "Orchestrator mandatory for multi-agent",
    domain: "architecture",
    pack: "base",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "orchestrator-validator",
    remediation: "Multi-agent tasks must route through the orchestrator. Direct agent-to-agent calls are prohibited.",
    rationale: "CGT v2 Section III-D: multi-agent orchestration requires central governance.",
    enabled: true,
  },

  // ── Lifecycle (LIFE-xxx) ───────────────────────────────────────────
  {
    id: "LIFE-001",
    name: "No stage skipping",
    domain: "lifecycle",
    pack: "base",
    riskCategory: "lifecycle_skip",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "lifecycle-sequence-validator",
    remediation: "Entries must follow Submit -> Register -> Validate -> Publish -> Catalog. No stage may be skipped.",
    rationale: "CGT v2 Section VI: sequential lifecycle is the foundation of governance integrity.",
    enabled: true,
  },
  {
    id: "LIFE-002",
    name: "Manual approval required",
    domain: "lifecycle",
    pack: "base",
    riskCategory: "lifecycle_skip",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "approval-validator",
    remediation: "Automatic promotion is prohibited. Each lifecycle transition requires explicit human approval with actor ID recorded.",
    rationale: "CGT v2 Section VI: no auto-promotion, every transition requires human accountability.",
    enabled: true,
  },
  {
    id: "LIFE-003",
    name: "Separation of duty enforced",
    domain: "lifecycle",
    pack: "base",
    riskCategory: "silent_escalation",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "separation-of-duty-validator",
    remediation: "The actor who submits an entry must not be the same actor who validates or publishes it.",
    rationale: "CGT v2 Section V: separation of duty prevents single-actor fraud.",
    enabled: true,
  },
  {
    id: "LIFE-004",
    name: "Publication gate triple validation",
    domain: "lifecycle",
    pack: "base",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["publish"],
    weight: 10,
    runnerId: "publication-gate-validator",
    remediation: "Publication requires: (1) Compliance Matrix PASS, (2) YAML Enforcement Spec PASS, (3) Admin Checklist COMPLETE, (4) No Critical/High violations.",
    rationale: "CGT v2 Section VII: triple validation is the final gate before production exposure.",
    enabled: true,
  },

  // ── Governance (GOV-xxx) ───────────────────────────────────────────
  {
    id: "GOV-001",
    name: "Deny-by-default enforced",
    domain: "governance",
    pack: "base",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "deny-default-validator",
    remediation: "Policy gate must operate in deny-by-default mode. In production, fail-closed is mandatory.",
    rationale: "CGT v2 foundational principle: deny-by-default is non-negotiable.",
    enabled: true,
  },
  {
    id: "GOV-002",
    name: "RBAC enforcement active",
    domain: "governance",
    pack: "base",
    riskCategory: "missing_rbac",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "rbac-enforcement-validator",
    remediation: "Role-based access control must be active on all tRPC procedures.",
    rationale: "CGT v2 Section V: every action requires role-checked authorization.",
    enabled: true,
  },
  {
    id: "GOV-003",
    name: "Audit logging operational",
    domain: "governance",
    pack: "base",
    riskCategory: "missing_audit",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "audit-logging-validator",
    remediation: "Governance audit logger and unified audit logger must both be operational.",
    rationale: "CGT v2 Section VIII: every decision must be logged for auditability.",
    enabled: true,
  },
  {
    id: "GOV-004",
    name: "Policy file integrity",
    domain: "governance",
    pack: "base",
    riskCategory: "missing_policy_mapping",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 5,
    runnerId: "policy-file-validator",
    remediation: "OPA .rego policy files must be present and syntactically valid.",
    rationale: "CGT v2 Section II: policy-as-code requires valid, present policy files.",
    enabled: true,
  },
  {
    id: "GOV-005",
    name: "No policy bypass",
    domain: "governance",
    pack: "base",
    riskCategory: "policy_bypass",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "policy-bypass-detector",
    remediation: "No code path may skip policy evaluation. All sensitive operations must call evaluatePolicy().",
    rationale: "CGT v2 Section II: every sensitive operation must pass through the policy gate.",
    enabled: true,
  },

  // ── Documentation (DOC-xxx) ────────────────────────────────────────
  {
    id: "DOC-001",
    name: "Governance documentation present",
    domain: "documentation",
    pack: "base",
    riskCategory: "incomplete_documentation",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 4,
    runnerId: "governance-docs-validator",
    remediation: "GOVERNANCE_BIBLE.md and ARCHITECTURE.md must exist in the repository.",
    rationale: "CGT v2 Section I: governance standard must be documented and accessible.",
    enabled: true,
  },
  {
    id: "DOC-002",
    name: "Entry documentation complete",
    domain: "documentation",
    pack: "base",
    riskCategory: "incomplete_documentation",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 4,
    runnerId: "entry-docs-validator",
    remediation: "Each catalog entry must have a name, type, and description before publication.",
    rationale: "CGT v2 Section VI: incomplete entries cannot be published.",
    enabled: true,
  },
  {
    id: "DOC-003",
    name: "Undocumented endpoints absent",
    domain: "documentation",
    pack: "base",
    riskCategory: "undocumented_endpoint",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 6,
    runnerId: "endpoint-docs-validator",
    remediation: "All API endpoints must be documented.",
    rationale: "CGT v2 Section III: undocumented endpoints are security blind spots.",
    enabled: true,
  },
];

// ============================================================================
// TYPE PACKS — provider, llm, model, agent, bot
// ============================================================================

// ── Phase 4 additions — CI Branch Protection ─────────────────────────
const PHASE4_BASE_CONTROLS: ControlDefinition[] = [
  {
    id: "GOV-006",
    name: "CI branch protection enforced",
    domain: "governance",
    pack: "base",
    riskCategory: "missing_enforcement_hook",
    severity: "critical",
    blocksStages: ["validate", "publish"],
    weight: 10,
    runnerId: "ci-branch-protection-validator",
    remediation: "Ensure governance-gate.yml and ci.yml workflows exist and enforce merge blocking.",
    rationale: "CGT v2 Section X: CI must block merge on governance violations.",
    enabled: true,
  },
];

const PROVIDER_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-P001",
    name: "Provider API key encrypted",
    domain: "type_specific",
    pack: "provider",
    riskCategory: "hardcoded_secret",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "provider-key-validator",
    remediation: "Provider API keys must be stored encrypted via the encryption service, never in plaintext config.",
    rationale: "Provider keys grant access to external APIs — plaintext storage is Critical.",
    enabled: true,
  },
  {
    id: "TYPE-P002",
    name: "Provider connection validated",
    domain: "type_specific",
    pack: "provider",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "provider-connection-validator",
    remediation: "Provider must demonstrate successful connection before validation. Dead providers cannot be published.",
    rationale: "Publishing unreachable providers degrades platform reliability.",
    enabled: true,
  },
  {
    id: "TYPE-P003",
    name: "Provider HTTPS-only endpoints",
    domain: "type_specific",
    pack: "provider",
    riskCategory: "missing_encryption",
    severity: "critical",
    blocksStages: ["validate", "publish"],
    weight: 10,
    runnerId: "provider-https-validator",
    remediation: "All provider endpoints must use HTTPS. HTTP is only allowed for localhost/development.",
    rationale: "CGT v2: HTTPS endpoints only — plaintext transport is Critical.",
    enabled: true,
  },
  {
    id: "TYPE-P004",
    name: "Provider auth method declared",
    domain: "type_specific",
    pack: "provider",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "provider-auth-method-validator",
    remediation: "Provider must declare its authentication method (API key, bearer token, OAuth, etc.).",
    rationale: "Undeclared auth methods prevent governance from verifying credential management.",
    enabled: true,
  },
  {
    id: "TYPE-P005",
    name: "Provider rate limit configured",
    domain: "type_specific",
    pack: "provider",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 6,
    runnerId: "provider-ratelimit-validator",
    remediation: "Provider must have rate limiting configuration before publication.",
    rationale: "Unconstrained providers can exhaust API quotas or budgets.",
    enabled: true,
  },
];

const LLM_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-L001",
    name: "LLM provider binding exists",
    domain: "type_specific",
    pack: "llm",
    riskCategory: "missing_enforcement_hook",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "llm-binding-validator",
    remediation: "LLM must be bound to a registered, validated provider. Orphan LLMs are not allowed.",
    rationale: "An LLM without a provider cannot serve requests — Critical at all stages.",
    enabled: true,
  },
  {
    id: "TYPE-L002",
    name: "LLM model identifier valid",
    domain: "type_specific",
    pack: "llm",
    riskCategory: "incomplete_documentation",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "llm-model-id-validator",
    remediation: "LLM must specify a valid model identifier recognized by its bound provider.",
    rationale: "Invalid model IDs cause runtime failures and degrade user experience.",
    enabled: true,
  },
  {
    id: "TYPE-L003",
    name: "LLM Catalog runtime authority set",
    domain: "type_specific",
    pack: "llm",
    riskCategory: "missing_policy_mapping",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 5,
    runnerId: "llm-catalog-authority-validator",
    remediation: "LLM runtime use must resolve from an active published Catalog entry via resolveCatalogLLMRuntimeAuthority; raw LLM versions are only internal catalog-eligibility state until Catalog approval, publication, activation, and runtime enablement are complete. The policy engine must be invoked on all version-creation paths.",
    rationale: "Catalog must be the runtime authority so internal LLM lifecycle state cannot bypass publication and activation governance. Version creation paths must evaluate policy rather than stamping policyDecision: pass.",
    enabled: true,
  },
];

const MODEL_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-M001",
    name: "Model file integrity verified",
    domain: "type_specific",
    pack: "model",
    riskCategory: "architecture_drift",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "model-integrity-validator",
    remediation: "Downloaded model files must have verified checksums. Corrupted models cannot be published.",
    rationale: "Tampered model files are a supply-chain risk.",
    enabled: true,
  },
  {
    id: "TYPE-M002",
    name: "Model quantization documented",
    domain: "type_specific",
    pack: "model",
    riskCategory: "incomplete_documentation",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 4,
    runnerId: "model-quantization-validator",
    remediation: "Model must declare its quantization level (fp16, q4, q8, etc.) before publication.",
    rationale: "Undeclared quantization misleads users about model quality.",
    enabled: true,
  },
];

// ── Phase 4 additions — Model Pack ────────────────────────────────────
const PHASE4_MODEL_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-M003",
    name: "Model license declared",
    domain: "type_specific",
    pack: "model",
    riskCategory: "incomplete_documentation",
    severity: "critical",
    blocksStages: ["validate", "publish"],
    weight: 9,
    runnerId: "model-license-validator",
    remediation: "Model must declare its license (MIT, Apache-2.0, LLAMA, etc.) before validation.",
    rationale: "CGT v2: License declared is mandatory — legal compliance requires provenance.",
    enabled: true,
  },
  {
    id: "TYPE-M004",
    name: "Model version required",
    domain: "type_specific",
    pack: "model",
    riskCategory: "architecture_drift",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "model-versioning-validator",
    remediation: "Model must declare a version for reproducibility and rollback capability.",
    rationale: "Unversioned models cannot be audited or rolled back.",
    enabled: true,
  },
];

const AGENT_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-A001",
    name: "Agent tool permissions scoped",
    domain: "type_specific",
    pack: "agent",
    riskCategory: "silent_escalation",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "agent-permission-validator",
    remediation: "Agent must declare its tool permissions explicitly. Unrestricted agents are Critical violations.",
    rationale: "Agents with unrestricted tool access can escalate privileges or exfiltrate data.",
    enabled: true,
  },
  {
    id: "TYPE-A002",
    name: "Agent orchestrator binding",
    domain: "type_specific",
    pack: "agent",
    riskCategory: "direct_provider_call",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 8,
    runnerId: "agent-orchestrator-validator",
    remediation: "Agent must route through the orchestrator for all provider calls. Direct invocation is prohibited.",
    rationale: "CGT v2 Section III-D: agents without orchestrator binding bypass governance.",
    enabled: true,
  },
  {
    id: "TYPE-A003",
    name: "Agent system prompt reviewed",
    domain: "type_specific",
    pack: "agent",
    riskCategory: "missing_policy_mapping",
    severity: "medium",
    blocksStages: ["publish"],
    weight: 5,
    runnerId: "agent-prompt-validator",
    remediation: "Agent system prompt must be reviewed and documented before publication.",
    rationale: "Unreviewed prompts may contain injection vectors or policy violations.",
    enabled: true,
  },
];

// ── Phase 4 additions — Agent Pack ────────────────────────────────────
const PHASE4_AGENT_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-A004",
    name: "Agent scope declared",
    domain: "type_specific",
    pack: "agent",
    riskCategory: "missing_policy_mapping",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "agent-scope-validator",
    remediation: "Agent must declare its operational scope (domains, capabilities, boundaries).",
    rationale: "CGT v2: Scope declared is mandatory — unbounded agents are Critical violations.",
    enabled: true,
  },
  {
    id: "TYPE-A005",
    name: "No direct secret access",
    domain: "type_specific",
    pack: "agent",
    riskCategory: "hardcoded_secret",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "agent-secret-access-validator",
    remediation: "Agent must not access secrets directly. Use secret manager references only.",
    rationale: "CGT v2: No direct secret access — agents route through secret service.",
    enabled: true,
  },
];

const BOT_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-B001",
    name: "Bot agent binding exists",
    domain: "type_specific",
    pack: "bot",
    riskCategory: "missing_enforcement_hook",
    severity: "critical",
    blocksStages: ["register", "validate", "publish"],
    weight: 10,
    runnerId: "bot-binding-validator",
    remediation: "Bot must be bound to a registered, validated agent. Orphan bots are not allowed.",
    rationale: "A bot without an agent cannot operate and represents a governance gap.",
    enabled: true,
  },
  {
    id: "TYPE-B002",
    name: "Bot interaction scope defined",
    domain: "type_specific",
    pack: "bot",
    riskCategory: "missing_policy_mapping",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "bot-scope-validator",
    remediation: "Bot must define its interaction scope (channels, users, permissions) before validation.",
    rationale: "Unbounded bots can interact with unintended surfaces.",
    enabled: true,
  },
];

// ============================================================================
// FULL CATALOG
// ============================================================================

// ── Phase 4 additions — Bot Pack ──────────────────────────────────────
const PHASE4_BOT_CONTROLS: ControlDefinition[] = [
  {
    id: "TYPE-B003",
    name: "Bot revocation endpoint exists",
    domain: "type_specific",
    pack: "bot",
    riskCategory: "missing_enforcement_hook",
    severity: "critical",
    blocksStages: ["validate", "publish"],
    weight: 10,
    runnerId: "bot-revocation-validator",
    remediation: "Bot must have a revocation endpoint for immediate disablement.",
    rationale: "CGT v2: Revocable immediately — bots without revocation are Critical.",
    enabled: true,
  },
  {
    id: "TYPE-B004",
    name: "Bot rate limit configured",
    domain: "type_specific",
    pack: "bot",
    riskCategory: "missing_enforcement_hook",
    severity: "high",
    blocksStages: ["validate", "publish"],
    weight: 7,
    runnerId: "bot-ratelimit-validator",
    remediation: "Bot must have rate limiting to prevent abuse and resource exhaustion.",
    rationale: "Unlimited bots can overwhelm systems and users.",
    enabled: true,
  },
  {
    id: "TYPE-B005",
    name: "Bot monitoring hook present",
    domain: "type_specific",
    pack: "bot",
    riskCategory: "missing_audit",
    severity: "high",
    blocksStages: ["publish"],
    weight: 7,
    runnerId: "bot-monitoring-validator",
    remediation: "Bot must have a monitoring/alerting hook before publication.",
    rationale: "CGT v2: Monitoring hooks present — unmonitored bots are governance blind spots.",
    enabled: true,
  },
];

import { loadControlsFromYaml } from "./yaml-loader";

// Try YAML first, fall back to hardcoded
const yamlControls = loadControlsFromYaml();

export const CONTROL_CATALOG: ControlDefinition[] = yamlControls || [
  ...BASE_CONTROLS,
  ...PHASE4_BASE_CONTROLS,
  ...PROVIDER_CONTROLS,
  ...LLM_CONTROLS,
  ...MODEL_CONTROLS,
  ...PHASE4_MODEL_CONTROLS,
  ...AGENT_CONTROLS,
  ...PHASE4_AGENT_CONTROLS,
  ...BOT_CONTROLS,
  ...PHASE4_BOT_CONTROLS,
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

/** Get controls by pack */
export function getControlsByPack(pack: PackType): ControlDefinition[] {
  return getActiveControls().filter((c) => c.pack === pack);
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
  return Array.from(new Set(getActiveControls().map((c) => c.runnerId)));
}
