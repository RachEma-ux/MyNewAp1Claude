/**
 * LLM Control Plane Router
 *
 * Provides tRPC endpoints for managing LLMs, versions, and promotions
 * Following RFC-001 specifications for governed, auditable LLM lifecycle
 *
 * Sub-routers (merged via spread to keep flat namespace):
 *  - llm-providers.ts: Provider registry, policy validation, device detection
 *  - llm-creation.ts: LLM creation & training pipeline
 */

import { z } from "zod";
import { protectedProcedure, governedProcedure, router } from "../_core/trpc";
import {
  createLLM,
  updateLLM,
  getLLMs,
  getLLMById,
  archiveLLM,
  createLLMVersion,
  getLLMVersions,
  getLLMVersion,
  getLatestCallableVersion,
  updateLLMVersionCallable,
  createPromotion,
  getPromotions,
  approvePromotion,
  rejectPromotion,
  getLLMAuditEvents,
} from "../db";
import "../services/training-executor"; // Initialize training executor

import { llmProvidersProcedures } from "./llm-providers";
import { llmCreationProcedures } from "./llm-creation";

// ============================================================================
// Input Validation Schemas
// ============================================================================

const llmRoleSchema = z.enum(["planner", "executor", "router", "guard", "observer", "embedder"]);
const environmentSchema = z.enum(["sandbox", "governed", "production"]);

const createLLMSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  role: llmRoleSchema,
  ownerTeam: z.string().max(255).optional(),
});

const updateLLMSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  role: llmRoleSchema.optional(),
  ownerTeam: z.string().max(255).optional(),
});

const llmConfigSchema = z.object({
  runtime: z.object({
    type: z.enum(["local", "cloud", "remote"]),
    provider: z.string().optional(),
    endpoint: z.string().optional(),
  }),
  model: z.object({
    name: z.string(),
    version: z.string().optional(),
    contextLength: z.number().optional(),
  }),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    streaming: z.boolean().optional(),
  }).optional(),
  capabilities: z.object({
    tools: z.array(z.string()).optional(),
    functions: z.array(z.string()).optional(),
  }).optional(),
});

const createVersionSchema = z.object({
  llmId: z.number().int().positive(),
  environment: environmentSchema,
  config: llmConfigSchema,
  policyBundleRef: z.string().max(512).optional(),
  policyHash: z.string().length(64).optional(),
  changeNotes: z.string().optional(),
});

const createPromotionSchema = z.object({
  llmVersionId: z.number().int().positive(),
  fromEnvironment: environmentSchema,
  toEnvironment: environmentSchema,
});

// ============================================================================
// LLM Registry Router
// ============================================================================

export const llmRouter = router({
  // ============================================================================
  // LLM Identity Management
  // ============================================================================

  create: governedProcedure
    .input(createLLMSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      console.log('[LLM Create] User ID:', ctx.user.id, 'Input:', input);

      const insertData = {
        name: input.name,
        description: input.description || null,
        role: input.role,
        ownerTeam: input.ownerTeam || null,
        createdBy: ctx.user.id,
      };

      console.log('[LLM Create] Insert data:', insertData);

      const llm = await createLLM(insertData);

      return llm;
    }),

  update: governedProcedure
    .input(updateLLMSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      const { id, ...updateData } = input;

      console.log('[LLM Update] User ID:', ctx.user.id, 'LLM ID:', id, 'Data:', updateData);

      const llm = await updateLLM(id, updateData, ctx.user.id);

      return llm;
    }),

  list: protectedProcedure
    .input(
      z.object({
        role: llmRoleSchema.optional(),
        archived: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const llms = await getLLMs(input);
      return llms;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const llm = await getLLMById(input.id);
      if (!llm) {
        throw new Error("LLM not found");
      }

      const [sandboxVersion, governedVersion, productionVersion, allVersions] = await Promise.all([
        getLatestCallableVersion(input.id, "sandbox"),
        getLatestCallableVersion(input.id, "governed"),
        getLatestCallableVersion(input.id, "production"),
        getLLMVersions(input.id),
      ]);

      return {
        ...llm,
        latestVersions: {
          sandbox: sandboxVersion,
          governed: governedVersion,
          production: productionVersion,
        },
        versionCount: allVersions.length,
      };
    }),

  archive: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await archiveLLM(input.id, ctx.user.id);
      return { success: true };
    }),

  // ============================================================================
  // LLM Version Management
  // ============================================================================

  createVersion: governedProcedure
    .input(createVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const version = await createLLMVersion({
        ...input,
        createdBy: ctx.user.id,
        policyDecision: "pass",
        attestationStatus: "pending",
        driftStatus: "none",
        callable: input.environment === "sandbox",
      });

      return version;
    }),

  getVersions: protectedProcedure
    .input(z.object({ llmId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const versions = await getLLMVersions(input.llmId);
      return versions;
    }),

  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const version = await getLLMVersion(input.versionId);
      if (!version) {
        throw new Error("Version not found");
      }
      return version;
    }),

  updateCallable: governedProcedure
    .input(
      z.object({
        versionId: z.number().int().positive(),
        callable: z.boolean(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await updateLLMVersionCallable(input.versionId, input.callable, input.reason);
      return { success: true };
    }),

  // ============================================================================
  // Promotion Workflow
  // ============================================================================

  createPromotion: governedProcedure
    .input(createPromotionSchema)
    .mutation(async ({ ctx, input }) => {
      const validPaths = [
        { from: "sandbox", to: "governed" },
        { from: "governed", to: "production" },
        { from: "sandbox", to: "production" },
      ];

      const isValidPath = validPaths.some(
        (path) => path.from === input.fromEnvironment && path.to === input.toEnvironment
      );

      if (!isValidPath) {
        throw new Error(`Invalid promotion path: ${input.fromEnvironment} → ${input.toEnvironment}`);
      }

      const promotion = await createPromotion({
        ...input,
        requestedBy: ctx.user.id,
        status: "pending",
      });

      return promotion;
    }),

  listPromotions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "simulated", "approved", "rejected", "executed", "failed"]).optional(),
        llmVersionId: z.number().int().positive().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const promotions = await getPromotions(input);
      return promotions;
    }),

  approvePromotion: governedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await approvePromotion(input.promotionId, ctx.user.id, input.comment);
      return { success: true };
    }),

  rejectPromotion: governedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await rejectPromotion(input.promotionId, ctx.user.id, input.reason);
      return { success: true };
    }),

  executePromotion: governedProcedure
    .input(z.object({ promotionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [promotion] = await getPromotions({ llmVersionId: input.promotionId });

      if (!promotion) {
        throw new Error("Promotion not found");
      }

      if (promotion.status !== "approved") {
        throw new Error("Promotion must be approved before execution");
      }

      const sourceVersion = await getLLMVersion(promotion.llmVersionId);
      if (!sourceVersion) {
        throw new Error("Source version not found");
      }

      const newVersion = await createLLMVersion({
        llmId: sourceVersion.llmId,
        environment: promotion.toEnvironment,
        config: sourceVersion.config,
        policyBundleRef: sourceVersion.policyBundleRef,
        policyHash: sourceVersion.policyHash,
        policyDecision: sourceVersion.policyDecision,
        policyViolations: sourceVersion.policyViolations,
        attestationContract: sourceVersion.attestationContract,
        attestationStatus: "pending",
        driftStatus: "none",
        callable: false,
        createdBy: ctx.user.id,
        changeNotes: `Promoted from ${promotion.fromEnvironment} (promotion #${promotion.id})`,
        promotionRequestId: promotion.id,
      });

      const { getDb } = await import("../db");
      const { llmPromotions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      if (db) {
        await db.update(llmPromotions)
          .set({
            status: "executed",
            executedAt: new Date(),
            newVersionId: newVersion.id,
          })
          .where(eq(llmPromotions.id, promotion.id));
      }

      return { success: true, newVersion };
    }),

  // ============================================================================
  // Audit & Compliance
  // ============================================================================

  getAuditEvents: protectedProcedure
    .input(
      z.object({
        llmId: z.number().int().positive().optional(),
        llmVersionId: z.number().int().positive().optional(),
        eventType: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional().default(100),
      })
    )
    .query(async ({ input }) => {
      const events = await getLLMAuditEvents(input);
      return events;
    }),

  // ============================================================================
  // Dashboard Statistics
  // ============================================================================

  getDashboardStats: protectedProcedure.query(async () => {
    const llms = await getLLMs({ archived: false });

    const stats = {
      totalLLMs: llms.length,
      byRole: {
        planner: llms.filter((l) => l.role === "planner").length,
        executor: llms.filter((l) => l.role === "executor").length,
        router: llms.filter((l) => l.role === "router").length,
        guard: llms.filter((l) => l.role === "guard").length,
        observer: llms.filter((l) => l.role === "observer").length,
        embedder: llms.filter((l) => l.role === "embedder").length,
      },
      byEnvironment: {
        sandbox: 0,
        governed: 0,
        production: 0,
      },
      attestationStatus: {
        attested: 0,
        pending: 0,
        failed: 0,
      },
      recentActivity: await getLLMAuditEvents({ limit: 10 }),
    };

    for (const llm of llms) {
      const versions = await getLLMVersions(llm.id);
      for (const version of versions) {
        stats.byEnvironment[version.environment]++;
        if (version.attestationStatus === "attested") {
          stats.attestationStatus.attested++;
        } else if (version.attestationStatus === "failed" || version.attestationStatus === "revoked") {
          stats.attestationStatus.failed++;
        } else {
          stats.attestationStatus.pending++;
        }
      }
    }

    return stats;
  }),

  // Spread in sub-router procedures (flat — preserves all route names)
  ...llmProvidersProcedures,
  ...llmCreationProcedures,
});
