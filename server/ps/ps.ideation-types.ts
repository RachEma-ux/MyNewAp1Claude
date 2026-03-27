/**
 * PS Ideation — Shared Types, Enums & Zod Schemas
 *
 * Canonical contract for the PS Ideation sub-module.
 */

import { z } from "zod";

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

// ── Step Payload Schemas ──────────────────────────────────────────────

export const ContextStepPayload = z.object({
  externalDriver: z.string().min(1),
  internalDriver: z.string().min(1),
  triggerEvent: z.string().min(1),
  shapesNeed: z.string().min(1),
});

export const ProblemStepPayload = z.object({
  whatIsNotWorking: z.string().min(1),
  whoIsImpacted: z.string().min(1),
  consequencesOfDoingNothing: z.string().min(1),
});

export const OpportunityStepPayload = z.object({
  whatCouldBeImproved: z.string().min(1),
  whatValueCouldBeCreated: z.string().min(1),
  strategicAdvantage: z.string().min(1),
});

export const GuidingQuestionStepPayload = z.object({
  whatIf: z.string().min(1),
});

export const IdeaGenerationStepPayload = z.object({
  brainstormingMethod: z.string().min(1),
  participants: z.string().min(1),
  rawIdeaList: z.string().optional(),
});

export const ClusteringStepPayload = z.object({
  patternsObserved: z.string().optional(),
});

export const ScreeningStepPayload = z.object({
  screeningCriteria: z.string().min(1),
  promisingIdeaIds: z.array(z.number()).optional(),
  deferredIdeaIds: z.array(z.number()).optional(),
});

export const ScenarioStepPayload = z.object({
  notes: z.string().optional(),
});

export const FeasibilityStepPayload = z.object({
  notes: z.string().optional(),
});

export const ConceptSelectionStepPayload = z.object({
  selectedIdeaId: z.number().int().positive(),
  rationale: z.object({
    strategicAlignment: z.string().optional(),
    expectedValue: z.string().optional(),
    feasibility: z.string().optional(),
    riskProfile: z.string().optional(),
    stakeholderSupport: z.string().optional(),
  }),
  nextStep: z.string().optional(),
});

export const OnePageSummaryStepPayload = z.object({
  theProblem: z.string().optional(),
  theOpportunity: z.string().optional(),
  topIdeas: z.string().optional(),
  scenariosExplored: z.string().optional(),
  feasibilityInsights: z.string().optional(),
  selectedConcept: z.string().optional(),
  reasonForSelection: z.string().optional(),
  overrideText: z.string().optional(),
});

export const STEP_PAYLOAD_SCHEMAS: Record<IdeationStepKey, z.ZodType<any>> = {
  context: ContextStepPayload,
  problem: ProblemStepPayload,
  opportunity: OpportunityStepPayload,
  guiding_question: GuidingQuestionStepPayload,
  idea_generation: IdeaGenerationStepPayload,
  clustering: ClusteringStepPayload,
  screening: ScreeningStepPayload,
  scenario_exploration: ScenarioStepPayload,
  feasibility: FeasibilityStepPayload,
  concept_selection: ConceptSelectionStepPayload,
  one_page_summary: OnePageSummaryStepPayload,
};

// ── Child Entity Schemas ──────────────────────────────────────────────

export const IdeaCreateSchema = z.object({
  ideationId: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceType: z.string().optional(),
});

export const IdeaUpdateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  themeId: z.number().int().positive().nullable().optional(),
  rankOrder: z.number().int().optional(),
  isShortlisted: z.number().int().min(0).max(1).optional(),
});

export const ThemeUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  ideationId: z.number().int().positive(),
  label: z.string().min(1),
  patternNotes: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const ScreeningUpsertSchema = z.object({
  ideationId: z.number().int().positive(),
  ideaId: z.number().int().positive(),
  criterionKey: z.string().min(1),
  score: z.number().int().min(0).max(10),
  note: z.string().optional(),
});

export const ScenarioUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  ideationId: z.number().int().positive(),
  ideaId: z.number().int().positive(),
  adoptionHighText: z.string().optional(),
  adoptionLowText: z.string().optional(),
  costIncreaseText: z.string().optional(),
  competitorReactionText: z.string().optional(),
  technologyLimitText: z.string().optional(),
  insightsText: z.string().optional(),
});

export const FeasibilityUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  ideationId: z.number().int().positive(),
  ideaId: z.number().int().positive(),
  testPerformed: z.string().min(1),
  finding1: z.string().optional(),
  finding2: z.string().optional(),
  feasibilityRating: z.enum(FEASIBILITY_RATINGS),
  confidence: z.string().optional(),
  evidenceRef: z.string().optional(),
  notes: z.string().optional(),
});

// ── Readiness / Handoff Schemas ───────────────────────────────────────

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

export const ConversionCommitSchema = z.object({
  ideationId: z.number().int().positive(),
  createdProjectId: z.number().int().positive().optional(),
  createdSystemId: z.number().int().positive().optional(),
});
