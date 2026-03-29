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
import { AGENT_CATALOG_ID, analyzeRawInput } from "../modules/pmt/context-translator-agent";

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
  result: client.TranslateResponse,
) {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(psIdeationTranslatorRuns).values({
      ideationId,
      rawInput: rawText,
      decisionGateStatus: result.decisionGate.status,
      resultJson: result as any,
      createdBy: userId,
    });
  } catch (persistErr: any) {
    console.error("Failed to persist translator run:", persistErr.message);
  }
}

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
      const resolvedLlm = await resolveAgentLlm();

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
      const resolvedLlm = await resolveAgentLlm();

      let result: client.TranslateResponse;
      let source: ExecutionSource;

      try {
        result = await analyzeRawInput(input.rawText, {
          provider: resolvedLlm?.provider,
          model: resolvedLlm?.model,
          apiBaseUrl: resolvedLlm?.apiBaseUrl,
        });

        if (result.decisionGate.reason?.includes("without LLM")) {
          source = "fallback-template";
        } else if (resolvedLlm) {
          source = "built-in-catalog-llm";
        } else {
          source = "built-in-llm";
        }
      } catch (fallbackErr: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Built-in fallback failed: ${fallbackErr.message || "unknown error"}`,
        });
      }

      // Persist the translator run
      await persistTranslatorRun(ctx.user.id, input.ideationId, input.rawText, result);

      return {
        ...result,
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
   * Maps the structured output into the existing step storage.
   */
  applyToIdeation: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      translatorResult: z.any(), // TranslateResponse shape
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const result = input.translatorResult as client.TranslateResponse;

      if (result.decisionGate.status !== "CONTINUE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot apply translator output in CLARIFICATION_NEEDED mode",
        });
      }

      // Map to step payloads
      const stepPayloads: Record<string, Record<string, unknown>> = {
        context: {
          externalDriver: result.coreSignals.externalDrivers.join("; "),
          internalDriver: result.coreSignals.internalDrivers.join("; "),
          triggerEvent: result.coreSignals.trigger,
          shapesNeed: result.projectContextResult,
        },
        problem: {
          problemStatement: result.problem.statement,
          status: result.problem.status,
        },
        opportunity: {
          opportunityStatement: result.opportunity.statement,
          status: result.opportunity.status,
        },
        guiding_question: {
          whatIfQuestion: result.whatIfQuestion,
        },
      };

      // Upsert step payloads
      const now = new Date();
      for (const [stepKey, payload] of Object.entries(stepPayloads)) {
        const stepOrder = [
          "context", "problem", "opportunity", "guiding_question",
          "idea_generation", "clustering", "screening",
          "scenario_exploration", "feasibility",
          "concept_selection", "one_page_summary",
        ].indexOf(stepKey);

        // Check if step exists
        const existing = await db.select()
          .from(psIdeationSteps)
          .where(eq(psIdeationSteps.ideationId, input.ideationId))
          .then(rows => rows.find(r => r.stepKey === stepKey));

        if (existing) {
          // Merge payload (keep user edits, add translator data)
          const merged = { ...(existing.payloadJson || {}), ...payload, _translatorApplied: true };
          await db.update(psIdeationSteps)
            .set({
              payloadJson: merged,
              stepStatus: "in_progress",
              lastSavedAt: now,
            })
            .where(eq(psIdeationSteps.id, existing.id));
        } else {
          await db.insert(psIdeationSteps).values({
            ideationId: input.ideationId,
            stepKey,
            stepOrder: stepOrder >= 0 ? stepOrder : 0,
            stepStatus: "in_progress",
            payloadJson: { ...payload, _translatorApplied: true },
            lastSavedAt: now,
          });
        }
      }

      // Update ideation snapshots
      await db.update(psIdeations)
        .set({
          problemStatementSnapshot: result.problem.statement || null,
          opportunityStatementSnapshot: result.opportunity.statement || null,
          guidingQuestionSnapshot: result.whatIfQuestion || null,
          updatedBy: ctx.user.id,
          updatedAt: now,
        })
        .where(eq(psIdeations.id, input.ideationId));

      return { applied: true, stepsUpdated: Object.keys(stepPayloads) };
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
