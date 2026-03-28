/**
 * PS Ideation — Shared Constants & Types
 *
 * Pure types and constants shared between client and server.
 * No Zod dependency — safe for browser import via @shared alias.
 */

// ── Enums / Literals ──────────────────────────────────────────────────

export const IDEATION_LIFECYCLE_STATUSES = [
  "draft",
  "in_exploration",
  "screening",
  "concept_selected",
  "ready_for_wizard",
  "deferred",
  "rejected",
  "converted",
] as const;
export type IdeationLifecycleStatus = (typeof IDEATION_LIFECYCLE_STATUSES)[number];

export const IDEATION_STEP_KEYS = [
  "context",
  "problem",
  "opportunity",
  "guiding_question",
  "idea_generation",
  "clustering",
  "screening",
  "scenario_exploration",
  "feasibility",
  "concept_selection",
  "one_page_summary",
] as const;
export type IdeationStepKey = (typeof IDEATION_STEP_KEYS)[number];

export const IDEATION_STEP_LABELS: Record<IdeationStepKey, string> = {
  context: "1. Context of the Project",
  problem: "2. The Problem",
  opportunity: "3. The Opportunity",
  guiding_question: "4. Guiding \"What If?\" Question",
  idea_generation: "5. Idea Generation (Divergent)",
  clustering: "6. Idea Clustering & Theming",
  screening: "7. Initial Screening (Filtering)",
  scenario_exploration: "8. \"What If?\" Scenario Exploration",
  feasibility: "9. Quick Feasibility Checks (Mini-POCs)",
  concept_selection: "10. Concept Selection",
  one_page_summary: "11. One-Page Summary (Optional)",
};

export const IDEATION_STEP_GROUPS: Record<string, IdeationStepKey[]> = {
  Intake: ["context", "problem", "opportunity", "guiding_question"],
  Exploration: ["idea_generation", "clustering"],
  Evaluation: ["screening", "scenario_exploration", "feasibility"],
  Decision: ["concept_selection", "one_page_summary"],
};

export const IDEATION_STEP_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "blocked",
] as const;
export type IdeationStepStatus = (typeof IDEATION_STEP_STATUSES)[number];

export const IDEATION_SOURCE_TYPES = ["manual", "import", "template", "ai"] as const;
export type IdeationSourceType = (typeof IDEATION_SOURCE_TYPES)[number];

export const FEASIBILITY_RATINGS = ["High", "Medium", "Low"] as const;
export type FeasibilityRating = (typeof FEASIBILITY_RATINGS)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ── Readiness / Handoff Interfaces ────────────────────────────────────

export interface ReadinessResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export interface ConceptPackage {
  ideationId: number;
  workspaceId: number;
  title: string;
  scenarioText: string;
  systemName: string;
  problemStatement: string;
  opportunityStatement: string;
  selectedConcept: string;
  rationale: string;
  feasibilityScore: string | null;
  riskLevel: string | null;
  scopeDraft: string | null;
  suggestedMethod: string | null;
  classificationHints: Record<string, string>;
}
