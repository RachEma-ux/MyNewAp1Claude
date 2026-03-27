/**
 * Culture Values — tRPC Router
 *
 * All CV operations under `cultureValues.*`.
 * Mutations use governedProcedure. Reads use protectedProcedure.
 */

import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import {
  cvValueSets,
  cvValueDefinitions,
  cvBehaviorModels,
  cvNonNegotiables,
  cvValueTranslations,
  cvOperationalization,
  cvAuditLog,
} from "../../drizzle/tables/culture-values";
import { validateValueSetTransition, validateValueDefTransition } from "./lifecycle";
import { logCvAudit } from "./audit";
import { validatePublishReadiness, requirePublishReady } from "./validation";
import { logActivity } from "../modules/registry";

// ── Value Sets ───────────────────────────────────────────────────────────

const valueSetsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(cvValueSets)
        .where(eq(cvValueSets.workspaceId, input.workspaceId))
        .orderBy(desc(cvValueSets.version));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [set] = await db.select().from(cvValueSets)
        .where(and(eq(cvValueSets.id, input.id), eq(cvValueSets.workspaceId, input.workspaceId)))
        .limit(1);
      if (!set) throw new TRPCError({ code: "NOT_FOUND", message: "Value set not found" });
      return set;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const existing = await db.select({ version: cvValueSets.version })
        .from(cvValueSets)
        .where(eq(cvValueSets.workspaceId, input.workspaceId))
        .orderBy(desc(cvValueSets.version))
        .limit(1);
      const nextVersion = (existing[0]?.version ?? 0) + 1;

      const [created] = await db.insert(cvValueSets).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        version: nextVersion,
        status: "draft",
        createdBy: ctx.user.id,
        metadata: input.metadata,
      }).returning();

      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "value_set.create", entityType: "value_set", entityId: created.id, newValue: { name: input.name, version: nextVersion } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "value_set.create", targetType: "value_set", targetId: created.id });
      return created;
    }),

  publish: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(cvValueSets)
        .where(and(eq(cvValueSets.id, input.id), eq(cvValueSets.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Value set not found" });

      validateValueSetTransition(existing.status, "active");
      await requirePublishReady(input.workspaceId, input.id);

      // Deprecate currently active sets
      const activeSets = await db.select().from(cvValueSets)
        .where(and(eq(cvValueSets.workspaceId, input.workspaceId), eq(cvValueSets.status, "active")));
      for (const s of activeSets) {
        await db.update(cvValueSets).set({ status: "deprecated", updatedAt: new Date() }).where(eq(cvValueSets.id, s.id));
      }

      const [published] = await db.update(cvValueSets)
        .set({ status: "active", publishedAt: new Date(), publishedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(cvValueSets.id, input.id))
        .returning();

      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "value_set.publish", entityType: "value_set", entityId: input.id, newValue: { status: "active" }, category: "status_change" });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "value_set.publish", targetType: "value_set", targetId: input.id });
      return published;
    }),

  changeStatus: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number(), status: z.enum(["draft", "active", "deprecated", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(cvValueSets)
        .where(and(eq(cvValueSets.id, input.id), eq(cvValueSets.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Value set not found" });
      validateValueSetTransition(existing.status, input.status);
      const [updated] = await db.update(cvValueSets).set({ status: input.status, updatedAt: new Date() }).where(eq(cvValueSets.id, input.id)).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "value_set.status_change", entityType: "value_set", entityId: input.id, previousValue: { status: existing.status }, newValue: { status: input.status }, category: "status_change" });
      return updated;
    }),

  validatePublish: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => validatePublishReadiness(input.workspaceId, input.id)),
});

// ── Value Definitions ────────────────────────────────────────────────────

const valueDefsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), valueSetId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(cvValueDefinitions)
        .where(and(eq(cvValueDefinitions.workspaceId, input.workspaceId), eq(cvValueDefinitions.valueSetId, input.valueSetId)))
        .orderBy(asc(cvValueDefinitions.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(), valueSetId: z.number(),
      code: z.string().min(1).max(50), name: z.string().min(1).max(200),
      description: z.string().optional(),
      type: z.enum(["core", "aspirational", "operational"]).default("core"),
      category: z.string().max(100).optional(),
      sortOrder: z.number().default(0),
      icon: z.string().max(50).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(cvValueDefinitions).values({ ...input, createdBy: ctx.user.id }).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "value_definition.create", entityType: "value_definition", entityId: created.id, newValue: { code: input.code, name: input.name, type: input.type } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "value_definition.create", targetType: "value_definition", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(), id: z.number(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      type: z.enum(["core", "aspirational", "operational"]).optional(),
      category: z.string().max(100).nullable().optional(),
      sortOrder: z.number().optional(),
      icon: z.string().max(50).nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      const [updated] = await db.update(cvValueDefinitions).set({ ...updates, updatedAt: new Date() }).where(and(eq(cvValueDefinitions.id, id), eq(cvValueDefinitions.workspaceId, workspaceId))).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Value definition not found" });
      await logCvAudit({ workspaceId, actorId: ctx.user.id, action: "value_definition.update", entityType: "value_definition", entityId: id, newValue: updates as Record<string, unknown> });
      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number(), status: z.enum(["active", "deprecated", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(cvValueDefinitions).where(and(eq(cvValueDefinitions.id, input.id), eq(cvValueDefinitions.workspaceId, input.workspaceId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Value definition not found" });
      validateValueDefTransition(existing.status, input.status);
      const [updated] = await db.update(cvValueDefinitions).set({ status: input.status, updatedAt: new Date() }).where(eq(cvValueDefinitions.id, input.id)).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "value_definition.status_change", entityType: "value_definition", entityId: input.id, previousValue: { status: existing.status }, newValue: { status: input.status } });
      return updated;
    }),
});

// ── Behaviors ────────────────────────────────────────────────────────────

const behaviorsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), valueDefinitionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(cvBehaviorModels)
        .where(and(eq(cvBehaviorModels.workspaceId, input.workspaceId), eq(cvBehaviorModels.valueDefinitionId, input.valueDefinitionId)))
        .orderBy(asc(cvBehaviorModels.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(), valueDefinitionId: z.number(),
      behavior: z.string().min(1), level: z.enum(["standard", "exemplary", "minimum"]).default("standard"),
      context: z.string().max(100).optional(), sortOrder: z.number().default(0),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(cvBehaviorModels).values({ ...input, createdBy: ctx.user.id }).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "behavior.create", entityType: "behavior", entityId: created.id });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "behavior.create", targetType: "behavior", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number(), behavior: z.string().min(1).optional(), level: z.enum(["standard", "exemplary", "minimum"]).optional(), context: z.string().max(100).nullable().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      const [updated] = await db.update(cvBehaviorModels).set({ ...updates, updatedAt: new Date() }).where(and(eq(cvBehaviorModels.id, id), eq(cvBehaviorModels.workspaceId, workspaceId))).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Behavior not found" });
      await logCvAudit({ workspaceId, actorId: ctx.user.id, action: "behavior.update", entityType: "behavior", entityId: id });
      return updated;
    }),
});

// ── Non-Negotiables ──────────────────────────────────────────────────────

const nonNegotiablesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), valueDefinitionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(cvNonNegotiables)
        .where(and(eq(cvNonNegotiables.workspaceId, input.workspaceId), eq(cvNonNegotiables.valueDefinitionId, input.valueDefinitionId)))
        .orderBy(asc(cvNonNegotiables.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(), valueDefinitionId: z.number(),
      description: z.string().min(1), severity: z.enum(["critical", "high", "medium"]).default("critical"),
      category: z.enum(["red_flag", "anti_pattern", "violation"]).default("red_flag"),
      sortOrder: z.number().default(0), metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(cvNonNegotiables).values({ ...input, createdBy: ctx.user.id }).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "non_negotiable.create", entityType: "non_negotiable", entityId: created.id });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "non_negotiable.create", targetType: "non_negotiable", targetId: created.id });
      return created;
    }),
});

// ── Value Translations ───────────────────────────────────────────────────

const translationsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), valueDefinitionId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(cvValueTranslations.workspaceId, input.workspaceId)];
      if (input.valueDefinitionId) conditions.push(eq(cvValueTranslations.valueDefinitionId, input.valueDefinitionId));
      return db.select().from(cvValueTranslations).where(and(...conditions)).orderBy(asc(cvValueTranslations.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(), valueDefinitionId: z.number(),
      unitType: z.string().min(1).max(50), unitIdentifier: z.string().min(1).max(200),
      translation: z.string().min(1), examples: z.array(z.string()).optional(),
      sortOrder: z.number().default(0), metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(cvValueTranslations).values({ ...input, createdBy: ctx.user.id }).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "translation.create", entityType: "translation", entityId: created.id });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "translation.create", targetType: "translation", targetId: created.id });
      return created;
    }),
});

// ── Operationalization Templates ─────────────────────────────────────────

const operationalizationRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), valueSetId: z.number().optional(), type: z.string().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(cvOperationalization.workspaceId, input.workspaceId)];
      if (input.valueSetId) conditions.push(eq(cvOperationalization.valueSetId, input.valueSetId));
      if (input.type) conditions.push(eq(cvOperationalization.type, input.type));
      return db.select().from(cvOperationalization).where(and(...conditions)).orderBy(asc(cvOperationalization.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(), valueDefinitionId: z.number().optional(), valueSetId: z.number().optional(),
      type: z.enum(["review_criteria", "onboarding_checklist", "bars_scale", "survey_question", "recognition_criteria"]),
      name: z.string().min(1).max(200), description: z.string().optional(),
      content: z.record(z.string(), z.unknown()).optional(), sortOrder: z.number().default(0),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(cvOperationalization).values({ ...input, createdBy: ctx.user.id }).returning();
      await logCvAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "operationalization.create", entityType: "operationalization", entityId: created.id });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "cv", actorId: ctx.user.id, action: "operationalization.create", targetType: "operationalization", targetId: created.id });
      return created;
    }),
});

// ── Audit ────────────────────────────────────────────────────────────────

const auditRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), entityType: z.string().optional(), limit: z.number().min(1).max(500).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(cvAuditLog.workspaceId, input.workspaceId)];
      if (input.entityType) conditions.push(eq(cvAuditLog.entityType, input.entityType));
      return db.select().from(cvAuditLog).where(and(...conditions)).orderBy(desc(cvAuditLog.createdAt)).limit(input.limit);
    }),
});

// ── Settings ─────────────────────────────────────────────────────────────

const settingsRouter = router({
  get: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async () => ({
      module: "cv",
      version: "1.0.0",
      features: { valueSets: true, definitions: true, behaviors: true, nonNegotiables: true, translations: true, operationalization: true, audit: true },
    })),
});

// ── Composed Router ──────────────────────────────────────────────────────

export const cultureValuesRouter = router({
  valueSets: valueSetsRouter,
  definitions: valueDefsRouter,
  behaviors: behaviorsRouter,
  nonNegotiables: nonNegotiablesRouter,
  translations: translationsRouter,
  operationalization: operationalizationRouter,
  audit: auditRouter,
  settings: settingsRouter,
});
