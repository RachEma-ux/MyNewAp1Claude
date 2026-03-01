/**
 * PM Agent Engine — TypeScript Types & Hardcoded Catalog Config
 *
 * Derives from pm-agent-engine-bundle.yaml.
 * Agents live in the AI Types Catalog; PM Central holds bindings (alias → catalog ref).
 * All agents are assistive only — drafts require human commit.
 */

// ── Catalog Binding ─────────────────────────────────────────────────────────

export interface CatalogBinding {
  alias: string;
  catalog_id: string;
  pinned_digest: string;
  display_name: string;
  description: string;
  phases_allowed: string[];
  enforcement_overlay: {
    deny: string[];
    require_human_review: boolean;
  };
}

// ── Agent Pack ──────────────────────────────────────────────────────────────

export interface AgentPack {
  id: string;
  name: string;
  description: string;
  agents: string[];  // binding aliases
  trigger: string;
  policies: {
    require_human_commit: boolean;
    forbid_gate_actions: boolean;
    forbid_state_transitions: boolean;
  };
}

// ── Orchestrator Invariants ─────────────────────────────────────────────────

export interface OrchestratorInvariants {
  deny_gate_actions: boolean;
  deny_state_transitions: boolean;
  deny_baseline_lock: boolean;
  require_human_commit_for_all_drafts: boolean;
}

// ── DAG Node ────────────────────────────────────────────────────────────────

export type DagNodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface DagNode {
  id: string;
  agent_alias: string;
  depends_on: string[];
  status: DagNodeStatus;
}

// ── Run Config ──────────────────────────────────────────────────────────────

export type RunType = "initiating_run" | "planning_run" | "gate_readiness_check" | "risk_deep_dive";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AgentRunConfig {
  projectId: number;
  runType: RunType;
  packId: string;
  dagNodes: DagNode[];
}

// ── Draft Output ────────────────────────────────────────────────────────────

export type DraftCommitStatus = "pending" | "committed" | "rejected";

export interface AgentDraftOutput {
  artifactType: string;
  content: Record<string, unknown>;
  sourceAgentAlias: string;
  requiresHumanReview: boolean;
}

// ── Audit Event ─────────────────────────────────────────────────────────────

export type AgentAuditEventType =
  | "binding_resolved"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "draft_created"
  | "draft_committed"
  | "draft_rejected"
  | "guard_denied"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";

// ── Denied Actions ──────────────────────────────────────────────────────────

export const DENIED_ACTIONS = [
  "gate_submit",
  "gate_approve",
  "gate_reject",
  "gate_waive",
  "state_transition",
  "baseline_lock",
  "baseline_unlock",
  "freeze",
  "unfreeze",
  "artifact_write_canonical",
] as const;

export type DeniedAction = typeof DENIED_ACTIONS[number];

// ── Hardcoded Catalog Bindings ──────────────────────────────────────────────

const ENFORCEMENT_OVERLAY = {
  deny: [...DENIED_ACTIONS],
  require_human_review: true,
};

export const CATALOG_BINDINGS: CatalogBinding[] = [
  {
    alias: "charter_drafter",
    catalog_id: "catalog.ai.agent.pm.charter_drafter",
    pinned_digest: "sha256:placeholder_charter",
    display_name: "Charter Drafter",
    description: "Generates project charter draft from wizard intake data",
    phases_allowed: ["initiating"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "scope_analyst",
    catalog_id: "catalog.ai.agent.pm.scope_analyst",
    pinned_digest: "sha256:placeholder_scope",
    display_name: "Scope Analyst",
    description: "Analyzes scope definition, identifies gaps and overlaps",
    phases_allowed: ["initiating", "planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "stakeholder_mapper",
    catalog_id: "catalog.ai.agent.pm.stakeholder_mapper",
    pinned_digest: "sha256:placeholder_stakeholder",
    display_name: "Stakeholder Mapper",
    description: "Maps stakeholder influence/interest and suggests engagement strategies",
    phases_allowed: ["initiating"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "risk_screener",
    catalog_id: "catalog.ai.agent.pm.risk_screener",
    pinned_digest: "sha256:placeholder_riskscreen",
    display_name: "Risk Screener",
    description: "Screens initial risks, suggests probability/impact ratings and mitigations",
    phases_allowed: ["initiating"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "readiness_checker",
    catalog_id: "catalog.ai.agent.pm.readiness_checker",
    pinned_digest: "sha256:placeholder_readiness",
    display_name: "Readiness Checker",
    description: "Validates gate readiness by checking completeness of required artifacts",
    phases_allowed: ["initiating", "planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "schedule_builder",
    catalog_id: "catalog.ai.agent.pm.schedule_builder",
    pinned_digest: "sha256:placeholder_schedule",
    display_name: "Schedule Builder",
    description: "Generates schedule draft with task dependencies and milestone mapping",
    phases_allowed: ["planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "cost_estimator",
    catalog_id: "catalog.ai.agent.pm.cost_estimator",
    pinned_digest: "sha256:placeholder_cost",
    display_name: "Cost Estimator",
    description: "Estimates project costs from WBS, resources, and schedule data",
    phases_allowed: ["planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "quality_checker",
    catalog_id: "catalog.ai.agent.pm.quality_checker",
    pinned_digest: "sha256:placeholder_quality",
    display_name: "Quality Checker",
    description: "Reviews quality standards and acceptance criteria for completeness",
    phases_allowed: ["planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
  {
    alias: "risk_analyst",
    catalog_id: "catalog.ai.agent.pm.risk_analyst",
    pinned_digest: "sha256:placeholder_riskanalyst",
    display_name: "Risk Analyst",
    description: "Full risk analysis with heat map, mitigation strategies, and contingencies",
    phases_allowed: ["planning"],
    enforcement_overlay: ENFORCEMENT_OVERLAY,
  },
];

// ── Hardcoded Agent Packs ───────────────────────────────────────────────────

export const AGENT_PACKS: AgentPack[] = [
  {
    id: "pmi_predictive_initiating",
    name: "PMI Predictive — Initiating",
    description: "Full initiating phase pack: charter, scope, stakeholders, risk screen, readiness",
    agents: ["charter_drafter", "scope_analyst", "stakeholder_mapper", "risk_screener", "readiness_checker"],
    trigger: "project_created",
    policies: { require_human_commit: true, forbid_gate_actions: true, forbid_state_transitions: true },
  },
  {
    id: "pmi_predictive_planning",
    name: "PMI Predictive — Planning",
    description: "Full planning phase pack: scope, schedule, cost, quality, risk, readiness",
    agents: ["scope_analyst", "schedule_builder", "cost_estimator", "quality_checker", "risk_analyst", "readiness_checker"],
    trigger: "gate_g0_passed",
    policies: { require_human_commit: true, forbid_gate_actions: true, forbid_state_transitions: true },
  },
  {
    id: "gate_readiness",
    name: "Gate Readiness Check",
    description: "Quick readiness validation before gate submission",
    agents: ["readiness_checker"],
    trigger: "manual",
    policies: { require_human_commit: true, forbid_gate_actions: true, forbid_state_transitions: true },
  },
  {
    id: "risk_deep_dive",
    name: "Risk Deep Dive",
    description: "Comprehensive risk analysis for high-risk projects",
    agents: ["risk_screener", "risk_analyst"],
    trigger: "manual",
    policies: { require_human_commit: true, forbid_gate_actions: true, forbid_state_transitions: true },
  },
];

// ── Orchestrator Invariants ─────────────────────────────────────────────────

export const ORCHESTRATOR_INVARIANTS: OrchestratorInvariants = {
  deny_gate_actions: true,
  deny_state_transitions: true,
  deny_baseline_lock: true,
  require_human_commit_for_all_drafts: true,
};

// ── DAG Templates ───────────────────────────────────────────────────────────

function makeNode(id: string, agent_alias: string, depends_on: string[]): DagNode {
  return { id, agent_alias, depends_on, status: "pending" };
}

export const DAG_TEMPLATES: Record<string, DagNode[]> = {
  initiating_run: [
    makeNode("resolve_bindings", "_system", []),
    makeNode("charter_drafter", "charter_drafter", ["resolve_bindings"]),
    makeNode("scope_analyst", "scope_analyst", ["resolve_bindings"]),
    makeNode("stakeholder_mapper", "stakeholder_mapper", ["resolve_bindings"]),
    makeNode("risk_screener", "risk_screener", ["resolve_bindings"]),
    makeNode("readiness_checker", "readiness_checker", ["charter_drafter", "scope_analyst", "stakeholder_mapper", "risk_screener"]),
    makeNode("compile_evidence", "_system", ["readiness_checker"]),
  ],
  planning_run: [
    makeNode("resolve_bindings", "_system", []),
    makeNode("scope_analyst", "scope_analyst", ["resolve_bindings"]),
    makeNode("schedule_builder", "schedule_builder", ["scope_analyst"]),
    makeNode("cost_estimator", "cost_estimator", ["schedule_builder"]),
    makeNode("quality_checker", "quality_checker", ["resolve_bindings"]),
    makeNode("risk_analyst", "risk_analyst", ["scope_analyst", "schedule_builder", "cost_estimator"]),
    makeNode("readiness_checker", "readiness_checker", ["scope_analyst", "schedule_builder", "cost_estimator", "quality_checker", "risk_analyst"]),
    makeNode("compile_evidence", "_system", ["readiness_checker"]),
  ],
  gate_readiness_check: [
    makeNode("resolve_bindings", "_system", []),
    makeNode("readiness_checker", "readiness_checker", ["resolve_bindings"]),
  ],
  risk_deep_dive: [
    makeNode("resolve_bindings", "_system", []),
    makeNode("risk_screener", "risk_screener", ["resolve_bindings"]),
    makeNode("risk_analyst", "risk_analyst", ["risk_screener"]),
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getBinding(alias: string): CatalogBinding | undefined {
  return CATALOG_BINDINGS.find((b) => b.alias === alias);
}

export function getPack(packId: string): AgentPack | undefined {
  return AGENT_PACKS.find((p) => p.id === packId);
}

export function getDagTemplate(runType: string): DagNode[] | undefined {
  const template = DAG_TEMPLATES[runType];
  if (!template) return undefined;
  // Return deep copy so callers don't mutate the template
  return template.map((n) => ({ ...n }));
}
