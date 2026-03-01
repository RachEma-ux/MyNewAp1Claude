/**
 * PMT Project Lifecycle State Machine
 *
 * Defines the full project lifecycle with 13 states, governance gates (G0-G4),
 * and deny-by-default transition validation.
 */

// ── States ──────────────────────────────────────────────────────────────────

export const PROJECT_STATES = [
  "draft_shell",
  "intake_review",
  "planning",
  "plan_gate_pending",
  "authorized",
  "executing",
  "control_hold",
  "change_pending",
  "closing",
  "close_gate_pending",
  "closed",
  "rejected",
  "archived",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

// ── Gate IDs ────────────────────────────────────────────────────────────────

export const GATE_IDS = ["G0", "G1", "G2", "G3", "G4"] as const;
export type GateId = (typeof GATE_IDS)[number];

export const GATE_LABELS: Record<GateId, string> = {
  G0: "Intake Review",
  G1: "Planning Authorization",
  G2: "Change Control",
  G3: "Operational Compliance",
  G4: "Closure",
};

// ── Authority types ─────────────────────────────────────────────────────────

export type TransitionAuthority = "pm_owner" | "system" | "admin";

// ── Transition definition ───────────────────────────────────────────────────

export interface TransitionDef {
  toState: ProjectState;
  authority: TransitionAuthority;
  gateRequired?: boolean;
  gateId?: GateId;
  label: string;
}

// ── State machine transitions ───────────────────────────────────────────────

export const PROJECT_TRANSITIONS: Record<ProjectState, TransitionDef[]> = {
  draft_shell: [
    { toState: "intake_review", authority: "pm_owner", label: "Submit for Intake" },
  ],
  intake_review: [
    { toState: "planning", authority: "system", gateRequired: true, gateId: "G0", label: "G0 Pass — Begin Planning" },
    { toState: "rejected", authority: "system", gateRequired: true, gateId: "G0", label: "G0 Fail — Reject" },
  ],
  planning: [
    { toState: "plan_gate_pending", authority: "pm_owner", label: "Submit Plan for Authorization" },
  ],
  plan_gate_pending: [
    { toState: "authorized", authority: "system", gateRequired: true, gateId: "G1", label: "G1 Pass — Authorize" },
    { toState: "planning", authority: "system", gateRequired: true, gateId: "G1", label: "G1 Fail — Rework Plan" },
  ],
  authorized: [
    { toState: "executing", authority: "pm_owner", label: "Start Execution" },
  ],
  executing: [
    { toState: "control_hold", authority: "system", gateRequired: true, gateId: "G3", label: "G3 Fail — Control Hold" },
    { toState: "change_pending", authority: "pm_owner", label: "Submit Change Request" },
    { toState: "closing", authority: "pm_owner", label: "Begin Closure" },
  ],
  control_hold: [
    { toState: "executing", authority: "system", label: "Remediation Complete — Resume" },
  ],
  change_pending: [
    { toState: "executing", authority: "system", gateRequired: true, gateId: "G2", label: "G2 Pass — Resume Execution" },
  ],
  closing: [
    { toState: "close_gate_pending", authority: "pm_owner", label: "Submit for Closure Gate" },
  ],
  close_gate_pending: [
    { toState: "closed", authority: "system", gateRequired: true, gateId: "G4", label: "G4 Pass — Close Project" },
    { toState: "closing", authority: "system", gateRequired: true, gateId: "G4", label: "G4 Fail — Rework Closure" },
  ],
  closed: [
    { toState: "archived", authority: "admin", label: "Archive" },
  ],
  rejected: [],
  archived: [],
};

// ── Validation ──────────────────────────────────────────────────────────────

export interface TransitionValidation {
  valid: boolean;
  gateRequired: boolean;
  gateId?: GateId;
  authority: TransitionAuthority;
  label: string;
  reason?: string;
}

export function validateTransition(
  fromState: ProjectState,
  toState: ProjectState,
): TransitionValidation {
  const transitions = PROJECT_TRANSITIONS[fromState];
  if (!transitions) {
    return { valid: false, gateRequired: false, authority: "system", label: "", reason: `Unknown state: ${fromState}` };
  }

  const match = transitions.find((t) => t.toState === toState);
  if (!match) {
    return {
      valid: false,
      gateRequired: false,
      authority: "system",
      label: "",
      reason: `Transition from "${fromState}" to "${toState}" is not allowed`,
    };
  }

  return {
    valid: true,
    gateRequired: match.gateRequired ?? false,
    gateId: match.gateId,
    authority: match.authority,
    label: match.label,
  };
}

// ── Available transitions for UI ────────────────────────────────────────────

export interface AvailableTransition {
  toState: ProjectState;
  label: string;
  gateRequired: boolean;
  gateId?: GateId;
  authority: TransitionAuthority;
}

export function getAvailableTransitions(currentState: ProjectState): AvailableTransition[] {
  const transitions = PROJECT_TRANSITIONS[currentState];
  if (!transitions) return [];

  return transitions.map((t) => ({
    toState: t.toState,
    label: t.label,
    gateRequired: t.gateRequired ?? false,
    gateId: t.gateId,
    authority: t.authority,
  }));
}

// ── State metadata for UI ───────────────────────────────────────────────────

export const STATE_LABELS: Record<ProjectState, string> = {
  draft_shell: "Draft",
  intake_review: "Intake Review",
  planning: "Planning",
  plan_gate_pending: "Plan Gate Pending",
  authorized: "Authorized",
  executing: "Executing",
  control_hold: "Control Hold",
  change_pending: "Change Pending",
  closing: "Closing",
  close_gate_pending: "Closure Gate Pending",
  closed: "Closed",
  rejected: "Rejected",
  archived: "Archived",
};

export const STATE_COLORS: Record<ProjectState, string> = {
  draft_shell: "gray",
  intake_review: "blue",
  planning: "indigo",
  plan_gate_pending: "yellow",
  authorized: "green",
  executing: "emerald",
  control_hold: "red",
  change_pending: "orange",
  closing: "purple",
  close_gate_pending: "yellow",
  closed: "slate",
  rejected: "red",
  archived: "zinc",
};

// ── Event type for audit trail ──────────────────────────────────────────────

export interface ProjectStateEvent {
  projectId: number;
  fromState: ProjectState;
  toState: ProjectState;
  actorId: number;
  gateRequestId?: number;
  reason?: string;
  timestamp: Date;
}

// ── Gate status enum ────────────────────────────────────────────────────────

export const GATE_STATUSES = ["pending", "evaluating", "passed", "failed", "waived"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

// ── Change request types ────────────────────────────────────────────────────

export const CHANGE_TYPES = ["scope", "schedule", "budget", "resource", "technical"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_IMPACTS = ["low", "medium", "high", "critical"] as const;
export type ChangeImpact = (typeof CHANGE_IMPACTS)[number];

export const CHANGE_STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "implemented"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

// ── Artifact types ──────────────────────────────────────────────────────────

export const ARTIFACT_TYPES = [
  "charter", "plan", "schedule", "risk_register",
  "status_report", "change_log", "closure_report",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
