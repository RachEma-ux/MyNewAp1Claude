/**
 * PS Ideation — Context Translator tRPC Sub-Router
 *
 * Exposes the Project Context Translator Python service
 * through the existing tRPC API layer at trpc.ps.ideation.contextTranslator.*
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
import { AGENT_CATALOG_ID } from "../modules/pmt/context-translator-agent";

export const contextTranslatorRouter = router({
  /**
   * POST /translate — Run the Project Context Translator on raw text.
   * Calls the Python service, persists the result, and returns it.
   */
  translate: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      rawText: z.string().min(10).max(10000),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Call the Python service
      let result: client.TranslateResponse;
      try {
        result = await client.translate({
          rawText: input.rawText,
          metadata: input.metadata,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: err.message || "Project Context Translator service unavailable",
        });
      }

      // Persist the translator run
      const db = getDb();
      if (db) {
        try {
          await db.insert(psIdeationTranslatorRuns).values({
            ideationId: input.ideationId,
            rawInput: input.rawText,
            decisionGateStatus: result.decisionGate.status,
            resultJson: result as any,
            createdBy: ctx.user.id,
          });
        } catch (persistErr: any) {
          // Log but don't fail the request — translator result is still valid
          console.error("Failed to persist translator run:", persistErr.message);
        }
      }

      return result;
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
   * Returns service URL, health URL, capabilities, and current health status.
   */
  resolveRuntime: protectedProcedure
    .query(async (): Promise<{
      resolved: boolean;
      target: ServiceRuntimeTarget | null;
      health: ServiceHealthResult | null;
      error: string | null;
    }> => {
      try {
        const target = await resolveServiceAgentByName(AGENT_CATALOG_ID);
        if (!target) {
          return {
            resolved: false,
            target: null,
            health: null,
            error: `Catalog entry '${AGENT_CATALOG_ID}' not found or not a service-based agent`,
          };
        }

        const health = await checkServiceHealthByName(AGENT_CATALOG_ID);
        return { resolved: true, target, health, error: null };
      } catch (err: any) {
        return {
          resolved: false,
          target: null,
          health: null,
          error: err.message || "Failed to resolve runtime",
        };
      }
    }),
});
