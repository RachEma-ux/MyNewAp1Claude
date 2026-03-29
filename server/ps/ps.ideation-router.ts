/**
 * PS Ideation — tRPC Router
 *
 * Exposes the full PS Ideation sub-module API under trpc.ps.ideation.*
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import * as service from "./ideation-service";
import * as conversion from "./ideation-conversion";
import { evaluateReadiness } from "./ideation-readiness";
import { composeSummary } from "./summary-composer";
import { getDb } from "../db/connection";
import { eq } from "drizzle-orm";
import { psIdeations } from "../../drizzle/tables/ps";
import { contextTranslatorRouter } from "./context-translator-router";
import {
  IDEATION_LIFECYCLE_STATUSES,
  IDEATION_STEP_KEYS,
  IdeaCreateSchema,
  IdeaUpdateSchema,
  ThemeUpsertSchema,
  ScreeningUpsertSchema,
  ScenarioUpsertSchema,
  FeasibilityUpsertSchema,
  ConversionCommitSchema,
} from "./ps.ideation-types";

// ── Steps sub-router ──────────────────────────────────────────────────

const stepsRouter = router({
  get: protectedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      stepKey: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.stepKey) {
        return service.getStep(input.ideationId, input.stepKey);
      }
      return service.getSteps(input.ideationId);
    }),

  save: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      stepKey: z.string().min(1),
      payload: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.saveStepPayload(
        input.ideationId,
        input.stepKey,
        input.payload as Record<string, unknown>,
        ctx.user.id,
      );
    }),
});

// ── Ideas sub-router ──────────────────────────────────────────────────

const ideasRouter = router({
  add: governedProcedure
    .input(IdeaCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return service.addIdea(input, ctx.user.id);
    }),

  update: governedProcedure
    .input(IdeaUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateIdea(input, ctx.user.id);
    }),

  remove: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return service.removeIdea(input.id, ctx.user.id);
    }),

  select: governedProcedure
    .input(z.object({
      ideationId: z.number().int().positive(),
      ideaId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.selectIdea(input.ideationId, input.ideaId, ctx.user.id);
    }),

  list: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listIdeas(input.ideationId);
    }),
});

// ── Themes sub-router ─────────────────────────────────────────────────

const themesRouter = router({
  upsert: governedProcedure
    .input(ThemeUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      return service.upsertTheme(input, ctx.user.id);
    }),

  remove: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return service.removeTheme(input.id);
    }),

  list: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listThemes(input.ideationId);
    }),
});

// ── Screening sub-router ──────────────────────────────────────────────

const screeningRouter = router({
  save: governedProcedure
    .input(ScreeningUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      return service.saveScreeningScore(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listScreeningScores(input.ideationId);
    }),
});

// ── Scenarios sub-router ──────────────────────────────────────────────

const scenariosRouter = router({
  upsert: governedProcedure
    .input(ScenarioUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      return service.upsertScenario(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listScenarios(input.ideationId);
    }),
});

// ── Feasibility sub-router ────────────────────────────────────────────

const feasibilityRouter = router({
  upsert: governedProcedure
    .input(FeasibilityUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      return service.upsertFeasibility(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listFeasibilityChecks(input.ideationId);
    }),
});

// ── Readiness sub-router ──────────────────────────────────────────────

const readinessRouter = router({
  evaluate: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { ready: false, blockers: ["DB unavailable"], warnings: [] };
      const [ideation] = await db.select().from(psIdeations).where(eq(psIdeations.id, input.ideationId));
      if (!ideation) return { ready: false, blockers: ["Ideation not found"], warnings: [] };
      return evaluateReadiness(ideation);
    }),
});

// ── Convert sub-router ────────────────────────────────────────────────

const convertRouter = router({
  prepareConceptPackage: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return conversion.prepareConceptPackage(input.ideationId, ctx.user.id);
    }),

  commit: governedProcedure
    .input(ConversionCommitSchema)
    .mutation(async ({ ctx, input }) => {
      return conversion.commitConversion(
        input.ideationId,
        input.createdProjectId,
        input.createdSystemId,
        ctx.user.id,
      );
    }),
});

// ── Main Ideation Router ──────────────────────────────────────────────

export const ideationRouter = router({
  // Top-level CRUD
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listIdeations(input.workspaceId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.getIdeationById(input.id);
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      title: z.string().min(1).max(500),
      sourceType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.createIdeation(input, ctx.user.id);
    }),

  updateMeta: governedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(500).optional(),
      riskLevel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.updateIdeationMeta(input.id, input, ctx.user.id);
    }),

  duplicate: governedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      carryPayloads: z.boolean().optional(),
      preserveLifecycle: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.duplicateIdeation(input.id, ctx.user.id, {
        carryPayloads: input.carryPayloads,
        preserveLifecycle: input.preserveLifecycle,
      });
    }),

  deleteDraft: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return service.deleteIdeationDraft(input.id, ctx.user.id);
    }),

  setCurrentStep: governedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      stepKey: z.enum(IDEATION_STEP_KEYS),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.setCurrentStep(input.id, input.stepKey, ctx.user.id);
    }),

  setLifecycleStatus: governedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(IDEATION_LIFECYCLE_STATUSES),
    }))
    .mutation(async ({ ctx, input }) => {
      return service.setLifecycleStatus(input.id, input.status, ctx.user.id);
    }),

  // Activity log
  activity: protectedProcedure
    .input(z.object({ ideationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return service.listActivity(input.ideationId);
    }),

  // KPIs for control panel
  kpis: protectedProcedure
    .query(async () => {
      return service.getIdeationKPIs();
    }),

  // Composed sub-routers
  steps: stepsRouter,
  ideas: ideasRouter,
  themes: themesRouter,
  screening: screeningRouter,
  scenarios: scenariosRouter,
  feasibility: feasibilityRouter,
  readiness: readinessRouter,
  convert: convertRouter,
  contextTranslator: contextTranslatorRouter,
});
