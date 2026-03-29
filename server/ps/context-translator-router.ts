/**
 * PS Ideation — Context Translator tRPC Sub-Router
 *
 * Execution precedence (non-negotiable):
 *
 *   1. Imported catalog agent → Python service (with resolved LLM override)
 *   2. Imported catalog agent → built-in LLM fallback (with resolved catalog LLM)
 *   3. Degraded template fallback (clearly labeled, never masquerades as primary)
 *
 * The selected defaultReasoningLlmRef from the catalog agent entry is always
 * resolved and passed to whichever execution path handles the request.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import * as client from "./context-translator-client";
import { psIdeations, psIdeationSteps } from "../../drizzle/tables/ps";
import { psIdeationTranslatorRuns } from "../../drizzle/tables/ps-translator";
import { eq, desc } from "drizzle-orm";
import {
  resolveServiceAgentByName,
  checkServiceHealthByName,
  type ServiceRuntimeTarget,
  type ServiceHealthResult,
} from "../catalog/service-runtime";
import { getCatalogEntryById, getCatalogEntries } from "../db/catalog";
import {
  getDefaultReasoningLlmRef,
  getDefaultReasoningProviderRef,
  getDefaultReasoningModel,
} from "@shared/catalog-execution";
import {
  AGENT_CATALOG_ID,
  normalizeTranslateResponse,
  analyzeWithQuestionTable,
  deriveTranslateResponse,
  buildClarificationEnrichedText,
} from "../modules/pmt/context-translator-agent";
import type { QuestionTableResponse, AnsweredQuestionRow, ClarificationChoiceGroup } from "@shared/ps-context-translator-types";

// ── LLM Resolution ─────────────────────────────────────────────────────────

interface ResolvedLlm {
  provider?: string;
  model?: string;
  apiBaseUrl?: string;
  catalogRef?: string;
  catalogEntryId?: number;
  displayName?: string;
}

/**
 * Resolve the Default Reasoning LLM from the catalog agent entry.
 * Checks config.agent.defaultReasoningLlmRef → catalog LLM entry → provider/model.
 * Falls back to config.agent.defaultReasoningProviderRef + defaultReasoningModel.
 */
async function resolveAgentLlm(): Promise<ResolvedLlm | null> {
  // Find the catalog agent entry
  const entries = await getCatalogEntries({ entryType: "agent" });
  const agentEntry = entries.find(e => e.name === AGENT_CATALOG_ID);
  if (!agentEntry) return null;

  const config = agentEntry.config as Record<string, unknown> | null;
  if (!config) return null;

  // Try config.agent.defaultReasoningLlmRef (catalog LLM entry ID)
  const llmRef = getDefaultReasoningLlmRef(config);
  if (llmRef) {
    const llmEntryId = parseInt(llmRef, 10);
    if (!isNaN(llmEntryId) && llmEntryId > 0) {
      const llmEntry = await getCatalogEntryById(llmEntryId);
      if (llmEntry && (llmEntry.entryType === "llm" || llmEntry.entryType === "model")) {
        const llmConfig = llmEntry.config as Record<string, unknown> | null;
        return {
          provider: (llmConfig?.provider as string) || (llmConfig?.llmProvider as string) || undefined,
          model: (llmConfig?.model as string) || (llmConfig?.modelId as string) || (llmConfig?.llmModel as string) || undefined,
          apiBaseUrl: (llmConfig?.baseUrl as string) || (llmConfig?.apiBaseUrl as string) || undefined,
          catalogRef: llmEntry.name,
          catalogEntryId: llmEntry.id,
          displayName: llmEntry.displayName || llmEntry.name,
        };
      }
    }
  }

  // Fallback: try config.agent.defaultReasoningProviderRef + defaultReasoningModel
  const providerRef = getDefaultReasoningProviderRef(config);
  const modelRef = getDefaultReasoningModel(config);

  if (providerRef || modelRef) {
    let provider: string | undefined;
    let apiBaseUrl: string | undefined;

    if (providerRef) {
      const providerEntryId = parseInt(providerRef, 10);
      if (!isNaN(providerEntryId) && providerEntryId > 0) {
        const providerEntry = await getCatalogEntryById(providerEntryId);
        if (providerEntry) {
          const pConfig = providerEntry.config as Record<string, unknown> | null;
          provider = (pConfig?.provider as string) || providerEntry.name;
          apiBaseUrl = (pConfig?.baseUrl as string) || (pConfig?.apiBaseUrl as string) || undefined;
        }
      }
    }

    if (provider || modelRef) {
      return {
        provider,
        model: modelRef || undefined,
        apiBaseUrl,
        catalogRef: providerRef || undefined,
      };
    }
  }

  return null;
}

// ── Execution Source Types ──────────────────────────────────────────────────

/**
 * Execution source tells the UI exactly how the translation was performed.
 *
 * - "service":  Python service executed with resolved LLM
 * - "built-in-llm": Built-in agent executed with provider-registry LLM
 * - "built-in-catalog-llm": Built-in agent executed with catalog-resolved LLM
 * - "fallback-template": No LLM available, template output only
 */
type ExecutionSource = "service" | "built-in-llm" | "built-in-catalog-llm" | "fallback-template";

/** Shared persist helper — used by both translate and translateFallback */
async function persistTranslatorRun(
  userId: number,
  ideationId: number,
  rawText: string,
  result: client.TranslateResponse | QuestionTableResponse,
) {
  const db = getDb();
  if (!db) return;
  try {
    const gateStatus = result.decisionGate?.status ?? "CONTINUE";
    await db.insert(psIdeationTranslatorRuns).values({
      ideationId,
      rawInput: rawText,
      decisionGateStatus: gateStatus,
      resultJson: result as any,
      createdBy: userId,
    });
  } catch (persistErr: any) {
    console.error("Failed to persist translator run:", persistErr.message);
  }
}

// Force restart — debug logging enabled
export const contextTranslatorRouter = router({
  /**
   * POST /translate — Run the Project Context Translator via service-backed path ONLY.
   *
   * Strict mode: does NOT auto-fallback to built-in LLM agent.
   * If the Python service is offline, this mutation throws BAD_GATEWAY.
   * The client must offer the built-in fallback as a separate explicit action.
   */
  translate: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      rawText: z.string().min(10).max(10000),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let resolvedLlm: Awaited<ReturnType<typeof resolveAgentLlm>> = null;
      try { resolvedLlm = await resolveAgentLlm(); } catch { /* non-fatal */ }

      const llmOverride: client.LlmOverride | undefined = resolvedLlm
        ? {
            provider: resolvedLlm.provider,
            model: resolvedLlm.model,
            apiBaseUrl: resolvedLlm.apiBaseUrl,
            catalogRef: resolvedLlm.catalogRef,
          }
        : undefined;

      const serviceUrl = process.env.PROJECT_CONTEXT_TRANSLATOR_URL || "http://localhost:8585";

      let result: client.TranslateResponse;
      try {
        result = await client.translate({
          rawText: input.rawText,
          metadata: input.metadata,
          llmOverride,
        });
      } catch (serviceErr: any) {
        // Strict: do NOT auto-fallback. Throw so the client can offer fallback explicitly.
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Project Context Translator service is offline at ${serviceUrl}. ${serviceErr.message || "Service unreachable"}. Use the built-in fallback action if available.`,
        });
      }

      // Persist the translator run
      await persistTranslatorRun(ctx.user.id, input.ideationId, input.rawText, result);

      return {
        ...result,
        _source: "service" as ExecutionSource,
        _resolvedLlm: resolvedLlm
          ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
          : null,
        _serviceError: null,
        _serviceUrl: null,
      };
    }),

  /**
   * POST /translateFallback — Run the built-in LLM fallback explicitly.
   *
   * This is the secondary path. It does NOT attempt the Python service.
   * The user must explicitly choose this action from the UI.
   * Results are always labeled as fallback output.
   */
  translateFallback: protectedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      rawText: z.string().min(10).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      let resolvedLlm: Awaited<ReturnType<typeof resolveAgentLlm>> = null;
      try {
        resolvedLlm = await resolveAgentLlm();
      } catch (llmErr: any) {
        console.warn(`[ContextTranslator] LLM resolution failed: ${llmErr.message}`);
      }

      let qtResult: QuestionTableResponse;
      let source: ExecutionSource;

      try {
        qtResult = await analyzeWithQuestionTable(input.rawText, {
          provider: resolvedLlm?.provider,
          model: resolvedLlm?.model,
          apiBaseUrl: resolvedLlm?.apiBaseUrl,
        });

        // Determine execution source
        const reason = qtResult.decisionGate?.reason ?? "";
        if (typeof reason === "string" && reason.includes("without LLM")) {
          source = "fallback-template";
        } else if (resolvedLlm) {
          source = "built-in-catalog-llm";
        } else {
          source = "built-in-llm";
        }
      } catch (fallbackErr: any) {
        console.error(`[ContextTranslator] translateFallback error:`, fallbackErr);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Built-in fallback failed: ${fallbackErr.message || "unknown error"}`,
        });
      }

      // Derive legacy response for persistence and display backward compat
      const legacyResult = deriveTranslateResponse(qtResult);

      // Persist the translator run (non-fatal)
      try {
        await persistTranslatorRun(ctx.user.id, input.ideationId, input.rawText, qtResult);
      } catch (persistErr: any) {
        console.error("[ContextTranslator] persist failed in fallback path:", persistErr.message);
      }

      return {
        ...legacyResult,
        answeredQuestions: qtResult.answeredQuestions,
        clarification: qtResult.clarification,
        _source: source,
        _resolvedLlm: resolvedLlm
          ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
          : null,
        _serviceError: null,
        _serviceUrl: null,
      };
    }),

  /**
   * POST /submitClarification — Re-run the translator with user's clarification selections.
   *
   * Takes the original raw text, the structured clarification choices from the
   * previous CLARIFICATION_NEEDED result, and the user's selections.
   * Enriches the raw text with the selected answers and re-analyzes.
   */
  submitClarification: protectedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      rawText: z.string().min(10).max(10000),
      clarificationChoices: z.array(z.object({
        groupKey: z.string(),
        groupLabel: z.string(),
        selectMode: z.enum(["single", "multi"]),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          rationale: z.string().optional(),
          confidence: z.enum(["high", "medium", "low"]).optional(),
        })),
        correspondingFields: z.array(z.string()),
        stepKey: z.string(),
      })),
      selections: z.record(z.string(), z.array(z.string())),
      freeText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Build enriched text from original + user's clarification selections
      const enrichedText = buildClarificationEnrichedText(
        input.rawText,
        input.clarificationChoices as ClarificationChoiceGroup[],
        { selections: input.selections, freeText: input.freeText },
      );

      let resolvedLlm: Awaited<ReturnType<typeof resolveAgentLlm>> = null;
      try { resolvedLlm = await resolveAgentLlm(); } catch { /* non-fatal */ }

      let qtResult: QuestionTableResponse;
      let source: ExecutionSource;

      try {
        qtResult = await analyzeWithQuestionTable(enrichedText, {
          provider: resolvedLlm?.provider,
          model: resolvedLlm?.model,
          apiBaseUrl: resolvedLlm?.apiBaseUrl,
        });

        const reason = qtResult.decisionGate?.reason ?? "";
        if (typeof reason === "string" && reason.includes("without LLM")) {
          source = "fallback-template";
        } else if (resolvedLlm) {
          source = "built-in-catalog-llm";
        } else {
          source = "built-in-llm";
        }
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Clarification re-analysis failed: ${err.message || "unknown error"}`,
        });
      }

      // Derive legacy response for display backward compat
      const legacyResult = deriveTranslateResponse(qtResult);

      // Persist the re-analysis run
      try {
        await persistTranslatorRun(ctx.user.id, input.ideationId, enrichedText, qtResult);
      } catch { /* non-fatal */ }

      return {
        ...legacyResult,
        answeredQuestions: qtResult.answeredQuestions,
        clarification: qtResult.clarification,
        _source: source,
        _resolvedLlm: resolvedLlm
          ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
          : null,
        _serviceError: null,
        _serviceUrl: null,
      };
    }),

  /**
   * Apply translator output to PS Ideation step payloads.
   * Maps the structured output into canonical UI payload keys that the
   * tool panels actually read:
   *   context:          externalDriver, internalDriver, triggerEvent, shapesNeed
   *   problem:          whatIsNotWorking, whoIsImpacted, consequencesOfDoingNothing
   *   opportunity:      whatCouldBeImproved, whatValueCouldBeCreated, strategicAdvantage
   *   guiding_question: whatIf
   */
  applyToIdeation: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      translatorResult: z.any(), // TranslateResponse or QuestionTableResponse shape
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Detect response shape: new question-table-driven vs legacy
      const hasAnsweredQuestions = Array.isArray(input.translatorResult?.answeredQuestions);

      // Safely extract string from a value that may be an object
      const toStr = (v: unknown): string => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          return String(o.signal || o.text || o.value || o.statement || JSON.stringify(v));
        }
        return String(v);
      };

      let stepPayloads: Record<string, Record<string, unknown>>;
      let problemSnapshot: string;
      let opportunitySnapshot: string;
      let guidingQuestionSnapshot: string;

      if (hasAnsweredQuestions) {
        // ── New question-table-driven path ────────────────────────────
        const answeredQuestions: AnsweredQuestionRow[] = input.translatorResult.answeredQuestions;

        // Check decision gate
        const gateStatus = input.translatorResult.decisionGate?.status;
        if (gateStatus === "CLARIFICATION_NEEDED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot apply translator output in CLARIFICATION_NEEDED mode",
          });
        }

        // Group answered questions by stepKey → field → answer
        const byStep: Record<string, Record<string, string>> = {};
        for (const row of answeredQuestions) {
          if (!byStep[row.stepKey]) byStep[row.stepKey] = {};
          byStep[row.stepKey][row.correspondingField] = row.answer || "";
        }

        // Build step payloads directly from answers — no backfill chains needed
        stepPayloads = {
          context: {
            externalDriver: byStep.context?.externalDriver || "",
            internalDriver: byStep.context?.internalDriver || "",
            triggerEvent: byStep.context?.triggerEvent || "",
            shapesNeed: byStep.context?.shapesNeed || "",
          },
          problem: {
            whatIsNotWorking: byStep.problem?.whatIsNotWorking || "",
            whoIsImpacted: byStep.problem?.whoIsImpacted || "",
            consequencesOfDoingNothing: byStep.problem?.consequencesOfDoingNothing || "",
          },
          opportunity: {
            whatCouldBeImproved: byStep.opportunity?.whatCouldBeImproved || "",
            whatValueCouldBeCreated: byStep.opportunity?.whatValueCouldBeCreated || "",
            strategicAdvantage: byStep.opportunity?.strategicAdvantage || "",
          },
          guiding_question: {
            whatIf: byStep.guiding_question?.whatIf || "",
          },
          idea_generation: {
            brainstormingMethod: byStep.idea_generation?.brainstormingMethod || "",
            participants: byStep.idea_generation?.participants || "",
            rawIdeaList: byStep.idea_generation?.rawIdeaList || "",
          },
          clustering: {
            patternsObserved: byStep.clustering?.patternsObserved || "",
            themeLabels: byStep.clustering?.themeLabels || "",
            ideaThemeGrouping: byStep.clustering?.ideaThemeGrouping || "",
          },
          screening: {
            screeningCriteria: byStep.screening?.screeningCriteria || "",
            promisingIdeas: byStep.screening?.promisingIdeas || "",
            deferredIdeas: byStep.screening?.deferredIdeas || "",
          },
          scenario_exploration: {
            notes: byStep.scenario_exploration?.notes || "",
            adoptionHighScenario: byStep.scenario_exploration?.adoptionHighScenario || "",
            adoptionLowScenario: byStep.scenario_exploration?.adoptionLowScenario || "",
            costIncreaseScenario: byStep.scenario_exploration?.costIncreaseScenario || "",
            competitorReactionScenario: byStep.scenario_exploration?.competitorReactionScenario || "",
            technologyLimitScenario: byStep.scenario_exploration?.technologyLimitScenario || "",
            scenarioInsights: byStep.scenario_exploration?.scenarioInsights || "",
          },
          feasibility: {
            notes: byStep.feasibility?.notes || "",
            testPerformed: byStep.feasibility?.testPerformed || "",
            keyFindings: byStep.feasibility?.keyFindings || "",
            feasibilityRating: byStep.feasibility?.feasibilityRating || "",
          },
          concept_selection: {
            selectedIdea: byStep.concept_selection?.selectedIdea || "",
            rationale: {
              strategicAlignment: byStep.concept_selection?.rationale || "",
              expectedValue: "",
              feasibility: "",
              riskProfile: "",
              stakeholderSupport: "",
            },
            nextStep: byStep.concept_selection?.nextStep || "",
          },
          one_page_summary: {
            theProblem: byStep.one_page_summary?.theProblem || "",
            theOpportunity: byStep.one_page_summary?.theOpportunity || "",
            topIdeas: byStep.one_page_summary?.topIdeas || "",
            scenariosExplored: byStep.one_page_summary?.scenariosExplored || "",
            feasibilityInsights: byStep.one_page_summary?.feasibilityInsights || "",
            selectedConcept: byStep.one_page_summary?.selectedConcept || "",
            reasonForSelection: byStep.one_page_summary?.reasonForSelection || "",
          },
        };

        problemSnapshot = byStep.problem?.whatIsNotWorking || "";
        opportunitySnapshot = byStep.opportunity?.whatCouldBeImproved || "";
        guidingQuestionSnapshot = byStep.guiding_question?.whatIf || "";

      } else {
        // ── Legacy path (old TranslateResponse shape) ─────────────────
        const result = normalizeTranslateResponse(input.translatorResult);

        if (result.decisionGate.status !== "CONTINUE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot apply translator output in CLARIFICATION_NEEDED mode",
          });
        }

        const pkg = result.psWizardScenarioPackage;
        const draft = result.ideationWorkflowDraft;
        const notes = result.framingNotes;

        const joinArr = (arr: unknown[] | undefined): string =>
          (arr || []).map(toStr).filter(s => s.trim()).join("; ");

        let externalDriver = joinArr(result.coreSignals?.externalDrivers);
        if (!externalDriver.trim()) {
          externalDriver = joinArr(notes?.extracted)
            || toStr(pkg?.urgencyDriver)
            || toStr(pkg?.businessNeed)
            || joinArr(result.extractedFacts?.slice(0, 2));
        }

        let internalDriver = joinArr(result.coreSignals?.internalDrivers);
        if (!internalDriver.trim()) {
          internalDriver = joinArr(notes?.inferred)
            || toStr(result.problem?.statement)
            || toStr(pkg?.primaryProblem);
        }

        let triggerEvent = toStr(result.coreSignals?.trigger);
        if (!triggerEvent.trim()) {
          triggerEvent = toStr(pkg?.urgencyDriver)
            || toStr(result.decisionGate?.reason)
            || (draft?.contextOfProject ? draft.contextOfProject.split(/[.!?]\s/)[0] || "" : "");
        }

        let shapesNeed = toStr(result.projectContextResult);
        if (!shapesNeed.trim()) {
          shapesNeed = toStr(draft?.contextOfProject)
            || toStr(pkg?.scenarioSummary)
            || [externalDriver, internalDriver, triggerEvent].filter(Boolean).join(" — ");
        }

        stepPayloads = {
          context: { externalDriver, internalDriver, triggerEvent, shapesNeed },
          problem: {
            whatIsNotWorking: toStr(result.problem?.statement),
            whoIsImpacted: "",
            consequencesOfDoingNothing: "",
          },
          opportunity: {
            whatCouldBeImproved: toStr(result.opportunity?.statement),
            whatValueCouldBeCreated: "",
            strategicAdvantage: "",
          },
          guiding_question: {
            whatIf: toStr(result.whatIfQuestion),
          },
          one_page_summary: {
            theProblem: toStr(result.ideationWorkflowDraft?.onePageSummary?.problem)
              || toStr(result.problem?.statement)
              || toStr(pkg?.primaryProblem),
            theOpportunity: toStr(result.ideationWorkflowDraft?.onePageSummary?.opportunity)
              || toStr(result.opportunity?.statement)
              || toStr(pkg?.opportunityStatement),
            topIdeas: (Array.isArray(result.ideationWorkflowDraft?.onePageSummary?.topIdeas) &&
              result.ideationWorkflowDraft.onePageSummary.topIdeas.length > 0)
                ? result.ideationWorkflowDraft.onePageSummary.topIdeas.join("\n")
                : (result.ideationWorkflowDraft?.ideaGeneration || []).map(toStr).filter(s => s.trim()).join("\n")
                || toStr(pkg?.recommendedDirection),
            scenariosExplored: toStr(result.ideationWorkflowDraft?.scenarioExploration?.insights)
              || toStr(pkg?.feasibilityNotes),
            feasibilityInsights: toStr(result.ideationWorkflowDraft?.onePageSummary?.feasibilityInsight)
              || toStr(result.ideationWorkflowDraft?.quickFeasibilityChecks?.feasibilityRating)
              || toStr(pkg?.feasibilityNotes),
            selectedConcept: toStr(result.ideationWorkflowDraft?.onePageSummary?.selectedConcept)
              || toStr(result.ideationWorkflowDraft?.conceptSelection?.selectedIdea)
              || toStr(pkg?.recommendedDirection),
            reasonForSelection: toStr(result.ideationWorkflowDraft?.onePageSummary?.reasonForSelection)
              || toStr(result.ideationWorkflowDraft?.conceptSelection?.rationale)
              || toStr(pkg?.recommendedDirectionRationale),
            overrideText: "",
          },
        };

        problemSnapshot = toStr(result.problem?.statement);
        opportunitySnapshot = toStr(result.opportunity?.statement);
        guidingQuestionSnapshot = toStr(result.whatIfQuestion);
      }

      // Upsert step payloads (shared by both paths)
      const now = new Date();
      const stepOrderMap = [
        "context", "problem", "opportunity", "guiding_question",
        "idea_generation", "clustering", "screening",
        "scenario_exploration", "feasibility",
        "concept_selection", "one_page_summary",
      ];

      for (const [stepKey, payload] of Object.entries(stepPayloads)) {
        const stepOrder = stepOrderMap.indexOf(stepKey);

        const existing = await db.select()
          .from(psIdeationSteps)
          .where(eq(psIdeationSteps.ideationId, input.ideationId))
          .then(rows => rows.find(r => r.stepKey === stepKey));

        if (existing) {
          const prev = (existing.payloadJson || {}) as Record<string, unknown>;
          const merged: Record<string, unknown> = { ...prev };
          for (const [k, v] of Object.entries(payload)) {
            const existingVal = prev[k];
            if (!existingVal || (typeof existingVal === "string" && !existingVal.trim())) {
              merged[k] = v;
            }
          }
          merged._translatorApplied = true;
          await db.update(psIdeationSteps)
            .set({
              payloadJson: merged,
              stepStatus: "complete",
              completedAt: now,
              lastSavedAt: now,
            })
            .where(eq(psIdeationSteps.id, existing.id));
        } else {
          await db.insert(psIdeationSteps).values({
            ideationId: input.ideationId,
            stepKey,
            stepOrder: stepOrder >= 0 ? stepOrder : 0,
            stepStatus: "complete",
            completedAt: now,
            payloadJson: { ...payload, _translatorApplied: true },
            lastSavedAt: now,
          });
        }
      }

      // Update ideation snapshots
      await db.update(psIdeations)
        .set({
          problemStatementSnapshot: problemSnapshot || null,
          opportunityStatementSnapshot: opportunitySnapshot || null,
          guidingQuestionSnapshot: guidingQuestionSnapshot || null,
          updatedBy: ctx.user.id,
          updatedAt: now,
        })
        .where(eq(psIdeations.id, input.ideationId));

      const updatedSteps = await db.select()
        .from(psIdeationSteps)
        .where(eq(psIdeationSteps.ideationId, input.ideationId))
        .orderBy(psIdeationSteps.stepOrder);

      // Build warnings for fields that remain empty
      const warnings: string[] = [];
      const ctx1 = stepPayloads.context;
      if (!String(ctx1.externalDriver || "").trim()) warnings.push("External Driver could not be determined");
      if (!String(ctx1.internalDriver || "").trim()) warnings.push("Internal Driver could not be determined");
      if (!String(ctx1.triggerEvent || "").trim()) warnings.push("Trigger Event could not be determined");
      if (!String(ctx1.shapesNeed || "").trim()) warnings.push("Project Context could not be determined");

      return {
        applied: true,
        stepsUpdated: Object.keys(stepPayloads),
        steps: updatedSteps,
        warnings,
      };
    }),

  /**
   * Generate a PS Wizard handoff payload from the latest translator run.
   */
  generateWizardHandoff: protectedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get the latest translator run for this ideation
      const [run] = await db.select()
        .from(psIdeationTranslatorRuns)
        .where(eq(psIdeationTranslatorRuns.ideationId, input.ideationId))
        .orderBy(desc(psIdeationTranslatorRuns.createdAt))
        .limit(1);

      if (!run || !run.resultJson) {
        return null;
      }

      const result = run.resultJson as unknown as client.TranslateResponse;
      return result.psWizardScenarioPackage || null;
    }),

  /**
   * Check health of the Python translator service.
   */
  health: protectedProcedure
    .query(async () => {
      try {
        return await client.checkHealth();
      } catch (err: any) {
        return {
          status: "unavailable",
          service: "project-context-translator",
          version: "unknown",
          llmProvider: "unknown",
          llmModel: "unknown",
          promptLoaded: false,
          error: err.message,
        };
      }
    }),

  /**
   * List previous translator runs for an ideation.
   */
  listRuns: protectedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      return db.select({
        id: psIdeationTranslatorRuns.id,
        ideationId: psIdeationTranslatorRuns.ideationId,
        rawInput: psIdeationTranslatorRuns.rawInput,
        decisionGateStatus: psIdeationTranslatorRuns.decisionGateStatus,
        createdAt: psIdeationTranslatorRuns.createdAt,
      })
        .from(psIdeationTranslatorRuns)
        .where(eq(psIdeationTranslatorRuns.ideationId, input.ideationId))
        .orderBy(desc(psIdeationTranslatorRuns.createdAt))
        .limit(20);
    }),

  /**
   * Resolve the catalog agent entry into a runtime target.
   *
   * Reports truthful states — never masks service-offline with built-in.
   * Returns distinct fields for:
   *   - serviceOnline: Python service reachable
   *   - llmConfigured: Default Reasoning LLM is set in catalog
   *   - builtInAvailable: built-in fallback can run
   */
  resolveRuntime: protectedProcedure
    .query(async (): Promise<{
      resolved: boolean;
      target: ServiceRuntimeTarget | null;
      health: ServiceHealthResult | null;
      serviceOnline: boolean;
      llmConfigured: boolean;
      resolvedLlm: { displayName?: string; provider?: string; model?: string } | null;
      builtInAvailable: boolean;
      serviceUrl: string | null;
      healthUrl: string | null;
      healthError: string | null;
      error: string | null;
    }> => {
      const builtInAvailable = true;

      // Resolve the catalog agent's Default Reasoning LLM
      let resolvedLlm: ResolvedLlm | null = null;
      try {
        resolvedLlm = await resolveAgentLlm();
      } catch {
        // LLM resolution failure is non-fatal
      }
      const llmConfigured = resolvedLlm !== null;

      try {
        const target = await resolveServiceAgentByName(AGENT_CATALOG_ID);
        if (!target) {
          // Agent not in catalog — no primary path available
          return {
            resolved: false,
            target: null,
            health: null,
            serviceOnline: false,
            llmConfigured,
            resolvedLlm: resolvedLlm
              ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
              : null,
            builtInAvailable,
            serviceUrl: null,
            healthUrl: null,
            healthError: null,
            error: `Catalog entry '${AGENT_CATALOG_ID}' not found`,
          };
        }

        // Check actual Python service health — report truthfully
        const health = await checkServiceHealthByName(AGENT_CATALOG_ID);
        const serviceOnline = health.available;

        return {
          resolved: true,
          target,
          health,
          serviceOnline,
          llmConfigured,
          resolvedLlm: resolvedLlm
            ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
            : null,
          builtInAvailable,
          serviceUrl: target.serviceUrl,
          healthUrl: target.healthUrl,
          healthError: serviceOnline ? null : (health.error || "Service did not respond"),
          error: null,
        };
      } catch (err: any) {
        return {
          resolved: false,
          target: null,
          health: null,
          serviceOnline: false,
          llmConfigured,
          resolvedLlm: resolvedLlm
            ? { displayName: resolvedLlm.displayName, provider: resolvedLlm.provider, model: resolvedLlm.model }
            : null,
          builtInAvailable,
          serviceUrl: null,
          healthUrl: null,
          healthError: null,
          error: err.message || "Failed to resolve runtime",
        };
      }
    }),
});
