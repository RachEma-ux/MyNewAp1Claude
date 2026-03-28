/**
 * PS Ideation — Shared Types, Enums & Zod Schemas
 *
 * Re-exports constants/types from shared (browser-safe),
 * adds Zod validation schemas (server-only).
 */

import { z } from "zod";

// ── Re-export everything from shared constants ───────────────────────
export {
  IDEATION_LIFECYCLE_STATUSES,
  type IdeationLifecycleStatus,
  IDEATION_STEP_KEYS,
  type IdeationStepKey,
  IDEATION_STEP_LABELS,
  IDEATION_STEP_GROUPS,
  IDEATION_STEP_STATUSES,
  type IdeationStepStatus,
  IDEATION_SOURCE_TYPES,
  type IdeationSourceType,
  FEASIBILITY_RATINGS,
  type FeasibilityRating,
  RISK_LEVELS,
  type RiskLevel,
  type ReadinessResult,
  type ConceptPackage,
} from "../../shared/ps-ideation-constants";

import { FEASIBILITY_RATINGS, type IdeationStepKey } from "../../shared/ps-ideation-constants";

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

export const ConversionCommitSchema = z.object({
  ideationId: z.number().int().positive(),
  createdProjectId: z.number().int().positive().optional(),
  createdSystemId: z.number().int().positive().optional(),
});
