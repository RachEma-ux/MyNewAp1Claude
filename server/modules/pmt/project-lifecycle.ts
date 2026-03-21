/**
 * PMT Project Lifecycle State Machine — Event-Driven Model
 *
 * 13 states, 19 named events, deny-by-default transition validation.
 * Supports FREEZE/UNFREEZE with prior_state storage, CLONE (Entry Path C),
 * method-pack-aware G1 gate validation, and backward-compatible toState-based API.
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

// ── Events ──────────────────────────────────────────────────────────────────

export const LIFECYCLE_EVENTS = [
  "SUBMIT_INTAKE",
  "G0_PASS",
  "G0_FAIL",
  "SUBMIT_PLAN",
  "G1_PASS",
  "G1_FAIL",
  "START_EXECUTION",
  "SUBMIT_CHANGE",
  "G2_PASS",
  "G3_FAIL",
  "REMEDIATION_COMPLETE",
  "BEGIN_CLOSURE",
  "SUBMIT_CLOSURE",
  "G4_PASS",
  "G4_FAIL",
  "ARCHIVE",
  "FREEZE",
  "UNFREEZE",
  "ATTACH_METHODPACK",
  "SELECT_LEAN_MODE",
] as const;

export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

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

// ── Transition definition (event-driven) ────────────────────────────────────

export interface TransitionDef {
  event: LifecycleEvent;
  fromState: ProjectState;
  toState: ProjectState;
  authority: TransitionAuthority;
  gateRequired?: boolean;
  gateId?: GateId;
  label: string;
  guards?: string[];
  sideEffects?: string[];
}

// ── FREEZE constants ────────────────────────────────────────────────────────

export const FREEZE_ELIGIBLE_STATES: ProjectState[] = [
  "planning",
  "authorized",
  "executing",
  "change_pending",
  "closing",
];

export function isFreezable(state: ProjectState): boolean {
  return FREEZE_ELIGIBLE_STATES.includes(state);
}

// ── Transition table ────────────────────────────────────────────────────────

export const TRANSITION_TABLE: TransitionDef[] = [
  // Entry Path A — Standard Initiation
  {
    event: "SUBMIT_INTAKE",
    fromState: "draft_shell",
    toState: "intake_review",
    authority: "pm_owner",
    label: "Submit for Intake",
  },

  // G0 Gate Outcomes
  {
    event: "G0_PASS",
    fromState: "intake_review",
    toState: "planning",
    authority: "system",
    gateRequired: true,
    gateId: "G0",
    label: "G0 Pass — Begin Planning",
  },
  {
    event: "G0_FAIL",
    fromState: "intake_review",
    toState: "rejected",
    authority: "system",
    gateRequired: true,
    gateId: "G0",
    label: "G0 Fail — Reject",
  },

  // Planning Phase
  {
    event: "SUBMIT_PLAN",
    fromState: "planning",
    toState: "plan_gate_pending",
    authority: "pm_owner",
    label: "Submit Plan for Authorization",
  },

  // G1 Gate Outcomes
  {
    event: "G1_PASS",
    fromState: "plan_gate_pending",
    toState: "authorized",
    authority: "system",
    gateRequired: true,
    gateId: "G1",
    label: "G1 Pass — Authorize",
    guards: ["methodpack_artifacts_check"],
  },
  {
    event: "G1_FAIL",
    fromState: "plan_gate_pending",
    toState: "planning",
    authority: "system",
    gateRequired: true,
    gateId: "G1",
    label: "G1 Fail — Rework Plan",
  },

  // Execution Phase
  {
    event: "START_EXECUTION",
    fromState: "authorized",
    toState: "executing",
    authority: "pm_owner",
    label: "Start Execution",
  },
  {
    event: "SUBMIT_CHANGE",
    fromState: "executing",
    toState: "change_pending",
    authority: "pm_owner",
    label: "Submit Change Request",
  },
  {
    event: "G2_PASS",
    fromState: "change_pending",
    toState: "executing",
    authority: "system",
    gateRequired: true,
    gateId: "G2",
    label: "G2 Pass — Resume Execution",
  },
  {
    event: "G3_FAIL",
    fromState: "executing",
    toState: "control_hold",
    authority: "system",
    gateRequired: true,
    gateId: "G3",
    label: "G3 Fail — Control Hold",
    sideEffects: ["audit_control_hold"],
  },
  {
    event: "REMEDIATION_COMPLETE",
    fromState: "control_hold",
    toState: "executing",
    authority: "system",
    label: "Remediation Complete — Resume",
    guards: ["not_frozen"],
  },

  // Closure Phase
  {
    event: "BEGIN_CLOSURE",
    fromState: "executing",
    toState: "closing",
    authority: "pm_owner",
    label: "Begin Closure",
  },
  {
    event: "SUBMIT_CLOSURE",
    fromState: "closing",
    toState: "close_gate_pending",
    authority: "pm_owner",
    label: "Submit for Closure Gate",
  },
  {
    event: "G4_PASS",
    fromState: "close_gate_pending",
    toState: "closed",
    authority: "system",
    gateRequired: true,
    gateId: "G4",
    label: "G4 Pass — Close Project",
  },
  {
    event: "G4_FAIL",
    fromState: "close_gate_pending",
    toState: "closing",
    authority: "system",
    gateRequired: true,
    gateId: "G4",
    label: "G4 Fail — Rework Closure",
  },

  // Terminal
  {
    event: "ARCHIVE",
    fromState: "closed",
    toState: "archived",
    authority: "admin",
    label: "Archive",
  },

  // FREEZE — one entry per eligible state
  ...FREEZE_ELIGIBLE_STATES.map((state): TransitionDef => ({
    event: "FREEZE",
    fromState: state,
    toState: "control_hold",
    authority: "pm_owner",
    label: "Freeze Project",
    sideEffects: ["store_prior_state"],
  })),

  // UNFREEZE — returns to prior state (resolved at runtime)
  {
    event: "UNFREEZE",
    fromState: "control_hold",
    toState: "control_hold", // placeholder — actual target is metadata.frozenFromState
    authority: "pm_owner",
    label: "Unfreeze Project",
    guards: ["has_prior_state"],
    sideEffects: ["restore_prior_state"],
  },
];

// ── Backward-compatible PROJECT_TRANSITIONS (derived from TRANSITION_TABLE) ─

/** Legacy transition map: state → available transitions (without FREEZE/UNFREEZE/ATTACH) */
export const PROJECT_TRANSITIONS: Record<ProjectState, Array<{
  toState: ProjectState;
  authority: TransitionAuthority;
  gateRequired?: boolean;
  gateId?: GateId;
  label: string;
}>> = (() => {
  const map: Record<string, Array<{
    toState: ProjectState;
    authority: TransitionAuthority;
    gateRequired?: boolean;
    gateId?: GateId;
    label: string;
  }>> = {};
  for (const s of PROJECT_STATES) map[s] = [];

  for (const t of TRANSITION_TABLE) {
    // Skip FREEZE/UNFREEZE/ATTACH_METHODPACK for legacy map
    if (t.event === "FREEZE" || t.event === "UNFREEZE" || t.event === "ATTACH_METHODPACK") continue;
    map[t.fromState].push({
      toState: t.toState,
      authority: t.authority,
      gateRequired: t.gateRequired,
      gateId: t.gateId,
      label: t.label,
    });
  }
  return map as Record<ProjectState, Array<{
    toState: ProjectState;
    authority: TransitionAuthority;
    gateRequired?: boolean;
    gateId?: GateId;
    label: string;
  }>>;
})();

// ── Event-based validation ──────────────────────────────────────────────────

export interface EventValidation {
  valid: boolean;
  transition?: TransitionDef;
  reason?: string;
}

/** Validate an event from a given state. Primary validation method. */
export function validateEvent(
  fromState: ProjectState,
  event: LifecycleEvent,
): EventValidation {
  const match = TRANSITION_TABLE.find(
    (t) => t.fromState === fromState && t.event === event,
  );
  if (!match) {
    return {
      valid: false,
      reason: `Event "${event}" is not valid from state "${fromState}"`,
    };
  }
  return { valid: true, transition: match };
}

/** Get the TransitionDef for an event from a given state, or null. */
export function getTransitionForEvent(
  fromState: ProjectState,
  event: LifecycleEvent,
): TransitionDef | null {
  return TRANSITION_TABLE.find(
    (t) => t.fromState === fromState && t.event === event,
  ) || null;
}

/** Get all events valid from the current state. */
export function getAvailableEvents(currentState: ProjectState): LifecycleEvent[] {
  const events = new Set<LifecycleEvent>();
  for (const t of TRANSITION_TABLE) {
    if (t.fromState === currentState) events.add(t.event);
  }
  return Array.from(events);
}

// ── Backward-compatible validation ──────────────────────────────────────────

export interface TransitionValidation {
  valid: boolean;
  gateRequired: boolean;
  gateId?: GateId;
  authority: TransitionAuthority;
  label: string;
  reason?: string;
  event?: LifecycleEvent;
}

/** Validate a transition by fromState → toState (backward-compatible). */
export function validateTransition(
  fromState: ProjectState,
  toState: ProjectState,
): TransitionValidation {
  // Find a matching transition in the table (exclude FREEZE/UNFREEZE for legacy compat)
  const match = TRANSITION_TABLE.find(
    (t) => t.fromState === fromState && t.toState === toState
      && t.event !== "FREEZE" && t.event !== "UNFREEZE" && t.event !== "ATTACH_METHODPACK",
  );

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
    event: match.event,
  };
}

// ── Available transitions for UI ────────────────────────────────────────────

export interface AvailableTransition {
  toState: ProjectState;
  label: string;
  gateRequired: boolean;
  gateId?: GateId;
  authority: TransitionAuthority;
  event?: LifecycleEvent;
}

/** Get available transitions from current state (for UI rendering). */
export function getAvailableTransitions(currentState: ProjectState): AvailableTransition[] {
  const transitions: AvailableTransition[] = [];
  const seen = new Set<string>();

  for (const t of TRANSITION_TABLE) {
    if (t.fromState !== currentState) continue;
    // Skip ATTACH_METHODPACK (self-transition, not useful for UI transition list)
    if (t.event === "ATTACH_METHODPACK") continue;
    // De-dup by event (FREEZE has multiple entries, show once)
    const key = `${t.event}:${t.toState}`;
    if (seen.has(key)) continue;
    seen.add(key);

    transitions.push({
      toState: t.toState,
      label: t.label,
      gateRequired: t.gateRequired ?? false,
      gateId: t.gateId,
      authority: t.authority,
      event: t.event,
    });
  }
  return transitions;
}

// ── Reverse lookup: map (fromState, toState) → event ────────────────────────

/** Given a from/to state pair, infer the lifecycle event (for backward compat). */
export function inferEventFromTransition(
  fromState: ProjectState,
  toState: ProjectState,
): LifecycleEvent | null {
  const match = TRANSITION_TABLE.find(
    (t) => t.fromState === fromState && t.toState === toState
      && t.event !== "FREEZE" && t.event !== "UNFREEZE",
  );
  return match?.event ?? null;
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
