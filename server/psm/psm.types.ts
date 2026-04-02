/**
 * PSM Types — Enums, status types, shared interfaces
 */

// ── Case Statuses ───────────────────────────────────────────────────────────
export const PSM_CASE_STATUSES = [
  "draft", "active", "paused", "completed", "abandoned", "archived",
] as const;
export type PsmCaseStatus = (typeof PSM_CASE_STATUSES)[number];

// ── Method Statuses ─────────────────────────────────────────────────────────
export const PSM_METHOD_STATUSES = ["draft", "active", "deprecated"] as const;
export type PsmMethodStatus = (typeof PSM_METHOD_STATUSES)[number];

// ── Content Statuses ────────────────────────────────────────────────────────
export const PSM_CONTENT_STATUSES = ["draft", "review", "published"] as const;
export type PsmContentStatus = (typeof PSM_CONTENT_STATUSES)[number];

// ── Run Statuses ────────────────────────────────────────────────────────────
export const PSM_RUN_STATUSES = [
  "draft", "active", "paused", "completed", "abandoned",
] as const;
export type PsmRunStatus = (typeof PSM_RUN_STATUSES)[number];

// ── Step Statuses ───────────────────────────────────────────────────────────
export const PSM_STEP_STATUSES = [
  "pending", "in_progress", "completed", "skipped",
] as const;
export type PsmStepStatus = (typeof PSM_STEP_STATUSES)[number];

// ── Content Pack Statuses ───────────────────────────────────────────────────
export const PSM_PACK_STATUSES = [
  "draft", "preview", "committed", "published", "rolled_back",
] as const;
export type PsmPackStatus = (typeof PSM_PACK_STATUSES)[number];

// ── Import Statuses ─────────────────────────────────────────────────────────
export const PSM_IMPORT_STATUSES = [
  "pending", "validating", "validated", "importing", "completed", "failed",
] as const;
export type PsmImportStatus = (typeof PSM_IMPORT_STATUSES)[number];

// ── Complexity ──────────────────────────────────────────────────────────────
export const PSM_COMPLEXITY_LEVELS = ["low", "medium", "high"] as const;
export type PsmComplexity = (typeof PSM_COMPLEXITY_LEVELS)[number];

// ── Timeframes ──────────────────────────────────────────────────────────────
export const PSM_TIMEFRAMES = ["short", "medium", "long"] as const;
export type PsmTimeframe = (typeof PSM_TIMEFRAMES)[number];

// ── Relation Types ──────────────────────────────────────────────────────────
export const PSM_RELATION_TYPES = [
  "complement", "alternative", "prerequisite", "variant",
] as const;
export type PsmRelationType = (typeof PSM_RELATION_TYPES)[number];

// ── Import Severity ─────────────────────────────────────────────────────────
export const PSM_IMPORT_SEVERITY = ["error", "warning", "info"] as const;
export type PsmImportSeverity = (typeof PSM_IMPORT_SEVERITY)[number];

// ── Selector Dimensions ─────────────────────────────────────────────────────
export const PSM_SELECTOR_DIMENSIONS = [
  { key: "urgency", label: "Urgency", description: "How quickly must this be resolved?" },
  { key: "complexity", label: "Complexity", description: "How complex is the problem?" },
  { key: "stakeholder_count", label: "Stakeholders", description: "How many stakeholders are involved?" },
  { key: "data_availability", label: "Data Availability", description: "How much data is available for analysis?" },
  { key: "process_maturity", label: "Process Maturity", description: "How mature are existing processes?" },
  { key: "innovation_need", label: "Innovation Need", description: "How much innovation is required?" },
  { key: "risk_level", label: "Risk Level", description: "What is the risk level?" },
  { key: "optimization_need", label: "Optimization Need", description: "Is optimization the primary goal?" },
  { key: "diagnosis_need", label: "Diagnosis Need", description: "Is root cause diagnosis needed?" },
  { key: "decision_making_need", label: "Decision Making", description: "Are formal decisions required?" },
  { key: "collaboration_intensity", label: "Collaboration", description: "How much group collaboration is needed?" },
  { key: "uncertainty_level", label: "Uncertainty", description: "How uncertain is the problem space?" },
] as const;
export type PsmSelectorDimension = (typeof PSM_SELECTOR_DIMENSIONS)[number]["key"];

// ── Audit Event Types ───────────────────────────────────────────────────────
export const PSM_AUDIT_EVENT_TYPES = [
  "method_created", "method_updated", "method_deprecated",
  "case_created", "case_updated", "case_completed", "case_abandoned",
  "run_started", "run_completed", "run_abandoned",
  "step_completed", "step_skipped",
  "recommendation_requested",
  "content_imported", "content_published", "content_rolled_back",
  "admin_action",
] as const;
export type PsmAuditEventType = (typeof PSM_AUDIT_EVENT_TYPES)[number];

// ── Status Colors ───────────────────────────────────────────────────────────
export const PSM_CASE_STATUS_COLORS: Record<PsmCaseStatus, string> = {
  draft: "zinc",
  active: "blue",
  paused: "amber",
  completed: "green",
  abandoned: "red",
  archived: "gray",
};

export const PSM_RUN_STATUS_COLORS: Record<PsmRunStatus, string> = {
  draft: "zinc",
  active: "blue",
  paused: "amber",
  completed: "green",
  abandoned: "red",
};

export const PSM_COMPLEXITY_COLORS: Record<PsmComplexity, string> = {
  low: "green",
  medium: "amber",
  high: "red",
};
