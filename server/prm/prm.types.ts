/**
 * PRM Types — Enums, status types, method types, shared interfaces
 */

// ── Case Statuses ───────────────────────────────────────────────────────────
export const PRM_CASE_STATUSES = [
  "draft",
  "intake",
  "triage",
  "analysis",
  "decision_pending",
  "in_resolution",
  "resolved",
  "verification_pending",
  "verified_closed",
  "reopened",
  "cancelled",
] as const;

export type PrmCaseStatus = (typeof PRM_CASE_STATUSES)[number];

// ── Status Machine — valid transitions ──────────────────────────────────────
export const PRM_STATUS_TRANSITIONS: Record<PrmCaseStatus, PrmCaseStatus[]> = {
  draft: ["intake", "cancelled"],
  intake: ["triage", "cancelled"],
  triage: ["analysis", "cancelled"],
  analysis: ["decision_pending", "cancelled"],
  decision_pending: ["in_resolution", "cancelled"],
  in_resolution: ["resolved", "cancelled"],
  resolved: ["verification_pending", "cancelled"],
  verification_pending: ["verified_closed", "resolved", "cancelled"],
  verified_closed: ["reopened"],
  reopened: ["analysis", "cancelled"],
  cancelled: [],
};

// ── Severity Levels ─────────────────────────────────────────────────────────
export const PRM_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type PrmSeverity = (typeof PRM_SEVERITIES)[number];

// ── Priority Levels ─────────────────────────────────────────────────────────
export const PRM_PRIORITIES = ["p1", "p2", "p3", "p4"] as const;
export type PrmPriority = (typeof PRM_PRIORITIES)[number];

// ── Source Types ────────────────────────────────────────────────────────────
export const PRM_SOURCE_TYPES = [
  "incident",
  "defect",
  "complaint",
  "process",
  "operational",
  "other",
] as const;
export type PrmSourceType = (typeof PRM_SOURCE_TYPES)[number];

// ── Method Types ────────────────────────────────────────────────────────────
export const PRM_METHOD_TYPES = [
  "five_whys",
  "fishbone",
  "rca",
  "a3",
  "eight_d_lite",
  "decision_matrix",
  "verification_checklist",
  "prevention_plan",
  "hypothesis_testing",
  "fault_isolation",
] as const;
export type PrmMethodType = (typeof PRM_METHOD_TYPES)[number];

// ── Method Categories ───────────────────────────────────────────────────────
export const PRM_METHOD_CATEGORIES = [
  "analytical",
  "creative",
  "scientific",
  "optimization",
  "process",
  "design",
] as const;
export type PrmMethodCategory = (typeof PRM_METHOD_CATEGORIES)[number];

// ── Action Types ────────────────────────────────────────────────────────────
export const PRM_ACTION_TYPES = ["containment", "corrective", "preventive"] as const;
export type PrmActionType = (typeof PRM_ACTION_TYPES)[number];

// ── Action Statuses ─────────────────────────────────────────────────────────
export const PRM_ACTION_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "reopened",
  "blocked",
] as const;
export type PrmActionStatus = (typeof PRM_ACTION_STATUSES)[number];

// ── Evidence Types ──────────────────────────────────────────────────────────
export const PRM_EVIDENCE_TYPES = [
  "file",
  "url",
  "screenshot",
  "log",
  "observation",
  "governance",
] as const;
export type PrmEvidenceType = (typeof PRM_EVIDENCE_TYPES)[number];

// ── Publication States ──────────────────────────────────────────────────────
export const PRM_PUBLICATION_STATES = [
  "draft",
  "under_review",
  "approved",
  "published",
  "rejected",
  "archived",
] as const;
export type PrmPublicationState = (typeof PRM_PUBLICATION_STATES)[number];

// ── Playbook Domains ────────────────────────────────────────────────────────
export const PRM_PLAYBOOK_DOMAINS = [
  "it_service",
  "manufacturing",
  "customer",
  "cross_functional",
  "general",
] as const;
export type PrmPlaybookDomain = (typeof PRM_PLAYBOOK_DOMAINS)[number];

// ── Event Types ─────────────────────────────────────────────────────────────
export const PRM_EVENT_TYPES = [
  "status_change",
  "assignment",
  "comment",
  "reopen",
  "close",
  "evidence_added",
  "verification_added",
  "method_started",
  "method_completed",
  "decision_added",
  "action_added",
  "action_completed",
  "closure_blocked",
  "closure_approved",
] as const;
export type PrmEventType = (typeof PRM_EVENT_TYPES)[number];

// ── Method Run Statuses ─────────────────────────────────────────────────────
export const PRM_METHOD_RUN_STATUSES = [
  "in_progress",
  "completed",
  "abandoned",
] as const;
export type PrmMethodRunStatus = (typeof PRM_METHOD_RUN_STATUSES)[number];

// ── Status Display Info ─────────────────────────────────────────────────────
export const PRM_STATUS_COLORS: Record<PrmCaseStatus, string> = {
  draft: "zinc",
  intake: "blue",
  triage: "amber",
  analysis: "purple",
  decision_pending: "orange",
  in_resolution: "indigo",
  resolved: "teal",
  verification_pending: "yellow",
  verified_closed: "green",
  reopened: "red",
  cancelled: "gray",
};

export const PRM_SEVERITY_COLORS: Record<PrmSeverity, string> = {
  critical: "red",
  high: "orange",
  medium: "yellow",
  low: "blue",
};
